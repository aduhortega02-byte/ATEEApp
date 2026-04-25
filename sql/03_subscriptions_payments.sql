-- ============================================================
-- Migration: 03_subscriptions_payments
-- Purpose:   Driver subscription state, ride payments,
--            driver wallets, and wallet transaction audit trail.
-- Depends:   01_schema.sql (profiles, rides, ride_bids)
-- ============================================================

-- ── SHARED UTILITY ───────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLE: subscriptions
-- One row per driver. Written exclusively by the Stripe webhook
-- handler (Supabase Edge Function, Phase 3).
-- Front-end never writes to this table directly.
-- ============================================================

create type subscription_status_enum as enum (
  'inactive',   -- never subscribed
  'trialing',   -- free trial
  'active',     -- paid and current
  'past_due',   -- payment failed, Stripe retrying
  'canceled'    -- ended
);

create table if not exists public.subscriptions (
  id                      uuid    primary key default uuid_generate_v4(),

  -- One subscription record per driver.
  -- References profiles.id (= auth.users.id).
  driver_id               uuid    not null unique
                                  references public.profiles(id)
                                  on delete cascade,

  -- Stripe identifiers
  stripe_customer_id      text    not null,
  stripe_subscription_id  text    unique,          -- null until first charge succeeds

  -- Access control source of truth
  status                  subscription_status_enum not null default 'inactive',

  -- Billing window
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,

  -- Plan metadata
  plan_id                 text    not null default 'atee_driver_monthly',
  amount_cents            int     not null default 2999,   -- $29.99
  currency                text    not null default 'usd',

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── INDEXES ──────────────────────────────────────────────────

create index if not exists idx_subs_driver_id
  on public.subscriptions (driver_id);

create index if not exists idx_subs_status
  on public.subscriptions (status);

create index if not exists idx_subs_stripe_customer
  on public.subscriptions (stripe_customer_id);

create index if not exists idx_subs_stripe_subscription
  on public.subscriptions (stripe_subscription_id);

-- Expiry lookups (renewal reminders, cron jobs)
create index if not exists idx_subs_period_end
  on public.subscriptions (current_period_end)
  where status in ('active', 'trialing');

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────

drop trigger if exists trg_subs_updated_at on public.subscriptions;
create trigger trg_subs_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.subscriptions enable row level security;

drop policy if exists "subs_driver_select" on public.subscriptions;
create policy "subs_driver_select"
  on public.subscriptions
  for select
  using (auth.uid() = driver_id);

-- No INSERT/UPDATE/DELETE for authenticated users.
-- Only the service-role key (webhook handler) may write.

-- ── SUBSCRIPTION ENFORCEMENT ON RIDE BIDS ────────────────────
-- Replaces the bids_driver_insert policy from 01_schema.sql.
--
-- A driver may only INSERT a bid when:
--   1. They are the driver on the bid row.
--   2. Their subscription status is 'active'.
--   3. Their billing period has not expired.
--      (current_period_end IS NULL handles the pre-Stripe-setup edge case
--       where a row exists with no period set yet — blocked by status check.
--       Once Stripe sets a period, the time check becomes the safety net
--       against stale webhook delivery.)

drop policy if exists "bids_driver_insert" on public.ride_bids;
create policy "bids_driver_insert"
  on public.ride_bids
  for insert
  with check (
    auth.uid() = driver_id
    and exists (
      select 1
        from public.subscriptions s
       where s.driver_id          = auth.uid()
         and s.status             = 'active'
         and (
               s.current_period_end is null
               or s.current_period_end > now()
             )
    )
  );

-- ============================================================
-- TABLE: payments
-- One row per ride payment. Created and updated exclusively
-- by the backend (Stripe webhook handler).
-- ============================================================

create type payment_status_enum as enum (
  'pending',
  'completed',
  'failed',
  'refunded'
);

create table if not exists public.payments (
  id                        uuid    primary key default uuid_generate_v4(),

  ride_id                   uuid    not null unique
                                    references public.rides(id)
                                    on delete cascade,

  passenger_id              uuid    not null references public.profiles(id),
  driver_id                 uuid    not null references public.profiles(id),

  -- Stored in cents (int) to avoid floating-point drift.
  amount_cents              int     not null check (amount_cents > 0),
  currency                  text    not null default 'usd',

  stripe_payment_intent_id  text    unique,
  status                    payment_status_enum not null default 'pending',

  created_at                timestamptz not null default now(),
  completed_at              timestamptz
);

-- ── INDEXES ──────────────────────────────────────────────────

create index if not exists idx_payments_ride_id
  on public.payments (ride_id);

create index if not exists idx_payments_passenger_id
  on public.payments (passenger_id);

create index if not exists idx_payments_driver_id
  on public.payments (driver_id);

create index if not exists idx_payments_status
  on public.payments (status);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.payments enable row level security;

drop policy if exists "payments_passenger_select" on public.payments;
create policy "payments_passenger_select"
  on public.payments
  for select
  using (auth.uid() = passenger_id);

drop policy if exists "payments_driver_select" on public.payments;
create policy "payments_driver_select"
  on public.payments
  for select
  using (auth.uid() = driver_id);

-- No client-side INSERT/UPDATE/DELETE.

-- ============================================================
-- TABLE: driver_wallets
-- Running balance per driver. Written by backend trigger
-- when a payment transitions to 'completed'.
-- ============================================================

create table if not exists public.driver_wallets (
  id                      uuid  primary key default uuid_generate_v4(),

  driver_id               uuid  not null unique
                                references public.profiles(id)
                                on delete cascade,

  balance_cents           int   not null default 0 check (balance_cents >= 0),
  total_earned_cents      int   not null default 0 check (total_earned_cents >= 0),
  total_withdrawn_cents   int   not null default 0 check (total_withdrawn_cents >= 0),

  updated_at              timestamptz not null default now()
);

drop trigger if exists trg_wallet_updated_at on public.driver_wallets;
create trigger trg_wallet_updated_at
  before update on public.driver_wallets
  for each row execute function public.set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.driver_wallets enable row level security;

drop policy if exists "wallet_driver_select" on public.driver_wallets;
create policy "wallet_driver_select"
  on public.driver_wallets
  for select
  using (auth.uid() = driver_id);

-- ============================================================
-- TABLE: wallet_transactions
-- Immutable audit trail. One row per credit (ride) or withdrawal.
-- ============================================================

create type wallet_tx_type_enum as enum (
  'credit',      -- ride completed, driver earned
  'withdrawal'   -- driver withdrew to bank
);

create table if not exists public.wallet_transactions (
  id             uuid    primary key default uuid_generate_v4(),

  wallet_id      uuid    not null
                         references public.driver_wallets(id)
                         on delete cascade,

  type           wallet_tx_type_enum not null,
  amount_cents   int     not null check (amount_cents > 0),
  description    text,
  ride_id        uuid    references public.rides(id),

  created_at     timestamptz not null default now()
);

-- ── INDEXES ──────────────────────────────────────────────────

create index if not exists idx_wallet_tx_wallet_id
  on public.wallet_transactions (wallet_id);

create index if not exists idx_wallet_tx_created_at
  on public.wallet_transactions (created_at desc);

create index if not exists idx_wallet_tx_ride_id
  on public.wallet_transactions (ride_id)
  where ride_id is not null;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_tx_driver_select" on public.wallet_transactions;
create policy "wallet_tx_driver_select"
  on public.wallet_transactions
  for select
  using (
    exists (
      select 1
        from public.driver_wallets w
       where w.id        = wallet_id
         and w.driver_id = auth.uid()
    )
  );

-- ── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.driver_wallets;
alter publication supabase_realtime add table public.wallet_transactions;
