-- Migration 18: Driver preferred area / corridor
alter table public.drivers
  add column if not exists preferred_area text;
