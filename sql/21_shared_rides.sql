-- Migration 21: seat-sharing
-- Passengers can opt in to share their ride with others going the same way.
-- Drivers declare how many seats are available when going online.

-- 1. Add available_seats to drivers
alter table public.drivers
  add column if not exists available_seats integer not null default 4;

alter table public.drivers
  add constraint drivers_available_seats_range check (available_seats between 1 and 4);

-- 2. Shared ride groups — container that links multiple passenger rides to one driver trip
create table if not exists public.shared_ride_groups (
  id              uuid        primary key default gen_random_uuid(),
  driver_id       uuid        references public.profiles(id) on delete set null,
  total_seats     integer     not null default 4,
  seats_available integer     not null default 4,
  destination_lat numeric(9,6),
  destination_lng numeric(9,6),
  status          text        not null default 'open'
                              check (status in ('open', 'full', 'in_progress', 'completed', 'cancelled')),
  created_at      timestamptz not null default now()
);

alter table public.shared_ride_groups enable row level security;

create policy "Shared groups readable by authenticated users"
  on public.shared_ride_groups for select
  using (auth.uid() is not null);

create policy "Authenticated users can create shared groups"
  on public.shared_ride_groups for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update shared groups"
  on public.shared_ride_groups for update
  using (auth.uid() is not null);

-- 3. Add shared ride columns to rides (FK after table exists)
alter table public.rides
  add column if not exists is_shared       boolean      not null default false;

alter table public.rides
  add column if not exists full_price      numeric(10,2);

alter table public.rides
  add column if not exists shared_group_id uuid
    references public.shared_ride_groups(id) on delete set null;

-- 4. Trigger: when a ride joins a group, decrement the group's seats_available
create or replace function public.handle_shared_group_seat_change()
returns trigger language plpgsql security definer as $$
begin
  if new.shared_group_id is not null
     and (old.shared_group_id is null or old.shared_group_id is distinct from new.shared_group_id) then

    update public.shared_ride_groups
    set seats_available = greatest(0, seats_available - coalesce(new.seats, 1))
    where id = new.shared_group_id;

    -- Seal the group when it fills up
    update public.shared_ride_groups
    set status = 'full'
    where id = new.shared_group_id and seats_available <= 0;

  end if;
  return new;
end;
$$;

drop trigger if exists on_ride_shared_group_change on public.rides;
create trigger on_ride_shared_group_change
  after update of shared_group_id on public.rides
  for each row execute function public.handle_shared_group_seat_change();
