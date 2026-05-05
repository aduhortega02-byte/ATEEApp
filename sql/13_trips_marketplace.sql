-- ============================================================
-- Migration: 13_trips_marketplace
-- Purpose: driver-posted trip listings + passenger seat bookings
-- Depends: 01_schema.sql, 11_vehicle_profile.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_status_enum') then
    create type trip_status_enum as enum ('active', 'departed', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status_enum') then
    create type booking_status_enum as enum ('confirmed', 'cancelled');
  end if;
end $$;

-- ── TRIPS TABLE ──────────────────────────────────────────────

create table if not exists public.trips (
  id                  uuid primary key default uuid_generate_v4(),
  driver_id           uuid not null references public.profiles(id) on delete cascade,
  origin_address      text not null,
  origin_lat          double precision not null,
  origin_lng          double precision not null,
  destination_address text not null,
  destination_lat     double precision not null,
  destination_lng     double precision not null,
  departure_at        timestamptz not null,
  seats_total         int not null check (seats_total between 1 and 8),
  seats_available     int not null check (seats_available >= 0),
  price_per_seat      numeric(10, 2) not null check (price_per_seat > 0),
  description         text,
  status              trip_status_enum not null default 'active',
  distance_mi         numeric(8, 2),
  eta_min             int,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (seats_available <= seats_total)
);

create index if not exists idx_trips_active_departure on public.trips(status, departure_at) where status = 'active';
create index if not exists idx_trips_driver on public.trips(driver_id);

-- ── BOOKINGS TABLE ───────────────────────────────────────────

create table if not exists public.trip_seat_bookings (
  id              uuid primary key default uuid_generate_v4(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  passenger_id    uuid not null references public.profiles(id) on delete cascade,
  seats_booked    int not null check (seats_booked between 1 and 8),
  total_price     numeric(10, 2) not null check (total_price > 0),
  payment_method  payment_method_enum not null,
  status          booking_status_enum not null default 'confirmed',
  passenger_note  text check (char_length(passenger_note) <= 280),
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  unique (trip_id, passenger_id, status) deferrable initially deferred
);

create index if not exists idx_bookings_passenger on public.trip_seat_bookings(passenger_id, status);
create index if not exists idx_bookings_trip on public.trip_seat_bookings(trip_id, status);

-- ── TRIGGERS: maintain seats_available ───────────────────────

create or replace function public.adjust_trip_seats_on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'confirmed') then
    update public.trips
       set seats_available = seats_available - new.seats_booked,
           updated_at = now()
     where id = new.trip_id;
    if not found then
      raise exception 'Trip not found';
    end if;
    return new;

  elsif (tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled') then
    update public.trips
       set seats_available = seats_available + old.seats_booked,
           updated_at = now()
     where id = old.trip_id;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_adjust_trip_seats on public.trip_seat_bookings;
create trigger trg_adjust_trip_seats
  after insert or update on public.trip_seat_bookings
  for each row execute function public.adjust_trip_seats_on_booking_change();

-- ── RLS: TRIPS ───────────────────────────────────────────────

alter table public.trips enable row level security;

drop policy if exists "trips_authenticated_read_active" on public.trips;
create policy "trips_authenticated_read_active"
  on public.trips for select
  using (auth.role() = 'authenticated');

drop policy if exists "trips_driver_insert" on public.trips;
create policy "trips_driver_insert"
  on public.trips for insert
  with check (auth.uid() = driver_id);

drop policy if exists "trips_driver_update" on public.trips;
create policy "trips_driver_update"
  on public.trips for update
  using (auth.uid() = driver_id);

-- ── RLS: BOOKINGS ────────────────────────────────────────────

alter table public.trip_seat_bookings enable row level security;

-- Passenger reads own bookings; driver reads bookings on their own trips
drop policy if exists "bookings_participant_read" on public.trip_seat_bookings;
create policy "bookings_participant_read"
  on public.trip_seat_bookings for select
  using (
    auth.uid() = passenger_id
    or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = auth.uid())
  );

-- Passenger creates own booking only on active trip with available seats
drop policy if exists "bookings_passenger_insert" on public.trip_seat_bookings;
create policy "bookings_passenger_insert"
  on public.trip_seat_bookings for insert
  with check (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and t.status = 'active'
        and t.seats_available >= seats_booked
    )
  );

-- Passenger or driver can cancel a booking
drop policy if exists "bookings_participant_update" on public.trip_seat_bookings;
create policy "bookings_participant_update"
  on public.trip_seat_bookings for update
  using (
    auth.uid() = passenger_id
    or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = auth.uid())
  );

-- ── REALTIME ─────────────────────────────────────────────────

alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_seat_bookings;
