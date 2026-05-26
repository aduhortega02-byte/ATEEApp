-- Migration 20: add seat count to rides
-- Passengers can request 1–4 seats; price is for the total, not per seat.

alter table public.rides
  add column if not exists seats integer not null default 1;

-- Constrain to valid range
alter table public.rides
  add constraint rides_seats_range check (seats between 1 and 4);
