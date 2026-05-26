-- ============================================================
-- Migration: 23_ride_negotiations
-- Purpose: Real-time price negotiation between passenger and driver
-- ============================================================

-- ── 1. TABLE ──────────────────────────────────────────────────

create table if not exists public.ride_negotiations (
  id            uuid          primary key default gen_random_uuid(),
  ride_id       uuid          not null references public.rides(id) on delete cascade,
  driver_id     uuid          not null references public.profiles(id) on delete cascade,
  passenger_id  uuid          not null references public.profiles(id) on delete cascade,
  offered_price numeric(10,2) not null check (offered_price > 0),
  status        text          not null default 'pending'
                              check (status in ('pending','accepted','declined','cancelled')),
  round         integer       not null default 1 check (round >= 1),
  created_by    text          not null check (created_by in ('driver','passenger')),
  created_at    timestamptz   not null default now()
);

-- Fast lookup: all negotiations for a ride (passenger view)
create index if not exists idx_negotiations_ride
  on public.ride_negotiations (ride_id, created_at desc);

-- Fast lookup: active negotiations per driver per ride (driver view)
create index if not exists idx_negotiations_ride_driver
  on public.ride_negotiations (ride_id, driver_id);

-- Partial index: only pending rows (most queried subset)
create index if not exists idx_negotiations_pending
  on public.ride_negotiations (ride_id, status)
  where status = 'pending';

-- ── 2. RLS ───────────────────────────────────────────────────

alter table public.ride_negotiations enable row level security;

drop policy if exists "negotiations_passenger_read" on public.ride_negotiations;
create policy "negotiations_passenger_read" on public.ride_negotiations
  for select using (passenger_id = auth.uid());

drop policy if exists "negotiations_passenger_insert" on public.ride_negotiations;
create policy "negotiations_passenger_insert" on public.ride_negotiations
  for insert with check (passenger_id = auth.uid());

drop policy if exists "negotiations_passenger_update" on public.ride_negotiations;
create policy "negotiations_passenger_update" on public.ride_negotiations
  for update using (passenger_id = auth.uid());

drop policy if exists "negotiations_driver_read" on public.ride_negotiations;
create policy "negotiations_driver_read" on public.ride_negotiations
  for select using (driver_id = auth.uid());

drop policy if exists "negotiations_driver_insert" on public.ride_negotiations;
create policy "negotiations_driver_insert" on public.ride_negotiations
  for insert with check (driver_id = auth.uid());

drop policy if exists "negotiations_driver_update" on public.ride_negotiations;
create policy "negotiations_driver_update" on public.ride_negotiations
  for update using (driver_id = auth.uid());

-- ── 3. TRIGGER: auto-cancel competing offers when one is accepted ──

create or replace function public.handle_negotiation_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    update public.ride_negotiations
    set    status = 'cancelled'
    where  ride_id = new.ride_id
      and  id      != new.id
      and  status  = 'pending';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_negotiation_accepted on public.ride_negotiations;
create trigger trg_negotiation_accepted
  after update on public.ride_negotiations
  for each row
  execute function public.handle_negotiation_accepted();

-- ── 4. REALTIME ───────────────────────────────────────────────

alter publication supabase_realtime add table ride_negotiations;
