-- ============================================================
-- ATEE — Ride Booking Schema
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (one row per user, linked to auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'passenger' check (role in ('passenger','driver','both')),
  avatar_url text,
  rating numeric(3,2) default 5.00,
  total_trips int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- DRIVERS (extra driver-only fields)
-- ============================================================
create table if not exists public.drivers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  plate_number text,
  is_online boolean default false,
  current_lat double precision,
  current_lng double precision,
  is_verified boolean default false,
  subscription_active boolean default false,
  last_seen timestamptz default now()
);

-- ============================================================
-- RIDES (one row per ride request)
-- ============================================================
create table if not exists public.rides (
  id uuid primary key default uuid_generate_v4(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid references public.profiles(id),

  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_address text not null,
  destination_lat double precision,
  destination_lng double precision,

  offered_price numeric(10,2) not null,
  distance_mi numeric(6,2),
  eta_min int,

  status text not null default 'requested'
    check (status in ('requested','matching','driver_assigned','in_progress','completed','cancelled')),

  scheduled_for timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_rides_status on public.rides(status);
create index if not exists idx_rides_passenger on public.rides(passenger_id);
create index if not exists idx_rides_driver on public.rides(driver_id);

-- ============================================================
-- RIDE_BIDS (drivers accepting the passenger's price)
-- ============================================================
create table if not exists public.ride_bids (
  id uuid primary key default uuid_generate_v4(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  eta_min int not null,
  status text not null default 'accepted'
    check (status in ('accepted','withdrawn','chosen','rejected')),
  created_at timestamptz default now(),
  unique(ride_id, driver_id)
);

create index if not exists idx_bids_ride on public.ride_bids(ride_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;
alter table public.ride_bids enable row level security;

-- Profiles: anyone authenticated can read, users edit their own
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- Drivers: public read (so passengers can see them), self write
drop policy if exists "drivers_read" on public.drivers;
create policy "drivers_read" on public.drivers
  for select using (auth.role() = 'authenticated');

drop policy if exists "drivers_write_self" on public.drivers;
create policy "drivers_write_self" on public.drivers
  for all using (auth.uid() = user_id);

-- Rides: passenger sees own rides; drivers see rides they're bidding on or assigned to;
-- online drivers see all 'requested' rides (to build a queue)
drop policy if exists "rides_passenger_read" on public.rides;
create policy "rides_passenger_read" on public.rides
  for select using (auth.uid() = passenger_id);

drop policy if exists "rides_driver_read" on public.rides;
create policy "rides_driver_read" on public.rides
  for select using (
    auth.uid() = driver_id
    or (status = 'requested' and exists (
      select 1 from public.drivers d where d.user_id = auth.uid() and d.is_online = true
    ))
  );

drop policy if exists "rides_passenger_insert" on public.rides;
create policy "rides_passenger_insert" on public.rides
  for insert with check (auth.uid() = passenger_id);

drop policy if exists "rides_update" on public.rides;
create policy "rides_update" on public.rides
  for update using (auth.uid() = passenger_id or auth.uid() = driver_id);

-- Ride bids: passenger sees bids on their ride; drivers see/create their own
drop policy if exists "bids_passenger_read" on public.ride_bids;
create policy "bids_passenger_read" on public.ride_bids
  for select using (
    exists (select 1 from public.rides r where r.id = ride_id and r.passenger_id = auth.uid())
    or driver_id = auth.uid()
  );

drop policy if exists "bids_driver_insert" on public.ride_bids;
create policy "bids_driver_insert" on public.ride_bids
  for insert with check (auth.uid() = driver_id);

drop policy if exists "bids_driver_update" on public.ride_bids;
create policy "bids_driver_update" on public.ride_bids
  for update using (auth.uid() = driver_id);

-- ============================================================
-- REALTIME: enable streaming on the tables we care about
-- ============================================================
alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.ride_bids;
alter publication supabase_realtime add table public.drivers;

-- ============================================================
-- TRIGGER: auto-create profile when user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'passenger')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
