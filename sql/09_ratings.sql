-- ============================================================
-- Migration: 09_ratings
-- Purpose: passenger rates the driver after a completed ride
-- Depends: 01_schema.sql
-- ============================================================

create table if not exists public.ride_ratings (
  id           uuid primary key default uuid_generate_v4(),
  ride_id      uuid not null unique references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  driver_id    uuid not null references public.profiles(id) on delete cascade,
  stars        int  not null check (stars between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ride_ratings_driver on public.ride_ratings(driver_id);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.ride_ratings enable row level security;

drop policy if exists "ratings_passenger_insert" on public.ride_ratings;
create policy "ratings_passenger_insert"
  on public.ride_ratings for insert
  with check (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.rides r
       where r.id = ride_id
         and r.passenger_id = auth.uid()
         and r.status = 'completed'
    )
  );

drop policy if exists "ratings_authenticated_read" on public.ride_ratings;
create policy "ratings_authenticated_read"
  on public.ride_ratings for select
  using (auth.role() = 'authenticated');

-- ── TRIGGER: recompute driver's rolling average rating ───────

create or replace function public.recompute_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg   numeric(3,2);
  v_count int;
begin
  select round(avg(stars)::numeric, 2), count(*)
    into v_avg, v_count
    from public.ride_ratings
   where driver_id = new.driver_id;

  update public.profiles
     set rating      = coalesce(v_avg, 5.00),
         total_trips = v_count
   where id = new.driver_id;

  return new;
end;
$$;

drop trigger if exists trg_recompute_driver_rating on public.ride_ratings;
create trigger trg_recompute_driver_rating
  after insert on public.ride_ratings
  for each row execute function public.recompute_driver_rating();

-- ── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.ride_ratings;
