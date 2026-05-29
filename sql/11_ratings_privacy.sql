-- ============================================================
-- Migration: 11_ratings_privacy
-- Purpose: Make passenger ratings private.
--          Drivers can only read ratings of themselves.
--          Passengers can only read ratings they submitted.
--          No cross-visibility: a driver cannot look up how
--          other passengers have been rated.
-- Depends: 09_ratings.sql
-- ============================================================

-- Drop the previous open policy (all authenticated users could read all ratings)
drop policy if exists "ratings_authenticated_read" on public.ride_ratings;

-- Drivers see only ratings where they are the rated driver
drop policy if exists "ratings_driver_read" on public.ride_ratings;
create policy "ratings_driver_read"
  on public.ride_ratings for select
  using (auth.uid() = driver_id);

-- Passengers see only ratings they themselves submitted
drop policy if exists "ratings_passenger_read" on public.ride_ratings;
create policy "ratings_passenger_read"
  on public.ride_ratings for select
  using (auth.uid() = passenger_id);
