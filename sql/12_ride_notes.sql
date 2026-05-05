alter table public.rides
  add column if not exists passenger_note text check (char_length(passenger_note) <= 280);
