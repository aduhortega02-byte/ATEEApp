-- ============================================================
-- Migration: 11_vehicle_profile
-- Purpose: ensure vehicle profile is required before driver goes online
-- Depends: 01_schema.sql
-- ============================================================

-- Add columns we don't yet have
alter table public.drivers
  add column if not exists vehicle_year         int,
  add column if not exists vehicle_total_seats  int check (vehicle_total_seats between 1 and 8),
  add column if not exists vehicle_updated_at   timestamptz;

-- ── TRIGGER: block setting is_online = true without a complete vehicle ──

create or replace function public.enforce_vehicle_required_to_go_online()
returns trigger
language plpgsql
as $$
begin
  if new.is_online = true and (old.is_online is distinct from true) then
    if new.vehicle_make is null
       or new.vehicle_model is null
       or new.vehicle_year is null
       or new.vehicle_color is null
       or new.plate_number is null
       or new.vehicle_total_seats is null then
      raise exception 'VEHICLE_PROFILE_REQUIRED'
        using hint = 'Driver must complete vehicle profile before going online.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_required_online on public.drivers;
create trigger trg_vehicle_required_online
  before update on public.drivers
  for each row execute function public.enforce_vehicle_required_to_go_online();

-- Touch vehicle_updated_at when any vehicle field changes
create or replace function public.touch_vehicle_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (new.vehicle_make is distinct from old.vehicle_make
      or new.vehicle_model is distinct from old.vehicle_model
      or new.vehicle_year is distinct from old.vehicle_year
      or new.vehicle_color is distinct from old.vehicle_color
      or new.plate_number is distinct from old.plate_number
      or new.vehicle_total_seats is distinct from old.vehicle_total_seats) then
    new.vehicle_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_vehicle_updated_at on public.drivers;
create trigger trg_touch_vehicle_updated_at
  before update on public.drivers
  for each row execute function public.touch_vehicle_updated_at();
