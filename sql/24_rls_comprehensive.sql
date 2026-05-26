-- Migration 24: RLS comprehensive audit — tighten shared_ride_groups UPDATE
-- All 14 tables already have RLS enabled with appropriate policies.
-- Only shared_ride_groups has an overly-permissive UPDATE policy.

-- Drop the blanket "any authenticated user" UPDATE policy.
drop policy if exists "Authenticated users can update shared groups" on public.shared_ride_groups;

-- Replace with driver-scoped UPDATE only.
-- The seat-change trigger (handle_shared_group_seat_change) runs SECURITY DEFINER
-- and bypasses RLS, so it still works without a permissive policy.
drop policy if exists "shared_groups_driver_update" on public.shared_ride_groups;
create policy "shared_groups_driver_update"
  on public.shared_ride_groups for update
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);
