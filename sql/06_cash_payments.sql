-- ============================================================
-- Migration: 06_cash_payments
-- Purpose:
--   1. Add payment_method + payment_status to rides
--   2. Extend driver_wallets with cash / etransfer / disputed counters
--   3. Trigger: when a driver marks ride completed+paid, update wallet stats
--   4. Remove subscription RLS gate from ride_bids (handled offline)
-- Depends: 01_schema.sql, 03_subscriptions_payments.sql
-- ============================================================

-- ── 1. ENUMS (DO block for Postgres < 17 compatibility) ───────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method_enum') then
    create type payment_method_enum as enum ('cash', 'etransfer');
  end if;
  if not exists (select 1 from pg_type where typname = 'ride_payment_status_enum') then
    create type ride_payment_status_enum as enum ('pending', 'paid', 'disputed');
  end if;
end $$;

-- ── 2. PAYMENT METHOD AND STATUS ON RIDES ────────────────────

alter table public.rides
  add column if not exists payment_method    payment_method_enum,
  add column if not exists payment_status    ride_payment_status_enum not null default 'pending';

-- ── 3. EXTEND driver_wallets WITH BREAKDOWN COLUMNS ──────────

alter table public.driver_wallets
  add column if not exists total_cash_cents      int not null default 0 check (total_cash_cents >= 0),
  add column if not exists total_etransfer_cents int not null default 0 check (total_etransfer_cents >= 0),
  add column if not exists trips_completed       int not null default 0 check (trips_completed >= 0),
  add column if not exists trips_disputed        int not null default 0 check (trips_disputed >= 0);

-- balance_cents stays in schema but unused for cash rides — kept for Stripe future.

-- ── 4. AUTO-UPDATE WALLET STATS ON RIDE COMPLETION ───────────

create or replace function public.update_wallet_on_ride_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount_cents int;
  v_method       payment_method_enum;
  v_paystatus    ride_payment_status_enum;
  v_wallet_id    uuid;
begin
  -- Only fire when status transitions TO 'completed'
  if not (tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed') then
    return new;
  end if;

  if new.driver_id is null then
    return new;
  end if;

  v_amount_cents := round(coalesce(new.offered_price, 0) * 100)::int;
  v_method       := new.payment_method;
  v_paystatus    := new.payment_status;

  -- Ensure wallet row exists
  insert into public.driver_wallets (driver_id)
  values (new.driver_id)
  on conflict (driver_id) do nothing;

  if v_paystatus = 'paid' then
    update public.driver_wallets
       set total_earned_cents    = total_earned_cents + v_amount_cents,
           trips_completed       = trips_completed + 1,
           total_cash_cents      = total_cash_cents
                                   + case when v_method = 'cash' then v_amount_cents else 0 end,
           total_etransfer_cents = total_etransfer_cents
                                   + case when v_method = 'etransfer' then v_amount_cents else 0 end
     where driver_id = new.driver_id
     returning id into v_wallet_id;

    insert into public.wallet_transactions (
      wallet_id, type, amount_cents, description, ride_id
    ) values (
      v_wallet_id, 'credit', v_amount_cents,
      format('Ride completed (%s) — %s', v_method,
             coalesce(new.destination_address, 'destination')),
      new.id
    );

  elsif v_paystatus = 'disputed' then
    update public.driver_wallets
       set trips_disputed  = trips_disputed + 1,
           trips_completed = trips_completed + 1
     where driver_id = new.driver_id
     returning id into v_wallet_id;

    insert into public.wallet_transactions (
      wallet_id, type, amount_cents, description, ride_id
    ) values (
      v_wallet_id, 'credit', 0,
      format('Ride completed but unpaid — %s',
             coalesce(new.destination_address, 'destination')),
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_update_wallet_on_ride_complete on public.rides;
create trigger trg_update_wallet_on_ride_complete
  after update on public.rides
  for each row
  execute function public.update_wallet_on_ride_complete();

-- ── 5. REMOVE SUBSCRIPTION GATE FROM RIDE_BIDS ───────────────
-- Subscriptions are handled offline. Restore simple bid policy:
-- driver may insert their own bid only.

drop policy if exists "bids_driver_insert" on public.ride_bids;
create policy "bids_driver_insert"
  on public.ride_bids
  for insert
  with check (auth.uid() = driver_id);
