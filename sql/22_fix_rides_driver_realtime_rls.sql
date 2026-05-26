-- Fix: allow online drivers to read 'cancelled' rides.
--
-- Root cause: Supabase Realtime v2 evaluates SELECT RLS on the NEW row state
-- before delivering a postgres_changes event. When a passenger cancels a ride,
-- the status flips from 'requested' → 'cancelled'. The old policy only granted
-- drivers access to 'requested' rides (and rides where they are driver_id). Since
-- a freshly cancelled ride satisfies neither condition, the realtime event was
-- silently filtered out — neither the driver's subscription nor their polling
-- fetch could see the row, so the DriverRequestScreen never reacted.
--
-- Fix: add 'cancelled' to the status allow-list. Cancelled rides contain no
-- sensitive ongoing-trip data, and the scope is still bounded to online drivers.

drop policy if exists "rides_driver_read" on public.rides;
create policy "rides_driver_read" on public.rides
  for select using (
    auth.uid() = driver_id
    or (status in ('requested', 'matching', 'cancelled') and exists (
      select 1 from public.drivers d where d.user_id = auth.uid() and d.is_online = true
    ))
  );
