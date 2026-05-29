-- ============================================================
-- Migration: 26_rls_hardening
-- Purpose:
--   1. Column-level privilege: revoke push_token from the
--      authenticated role so clients can never read another
--      user's push token. The send-push Edge Function reads it
--      via the service_role key, not the client key.
--   2. Add char_length CHECK constraints on all free-text
--      columns to prevent oversized payload abuse.
--   3. Restrict drivers UPDATE policy to exclude is_verified /
--      subscription_active (platform-set fields).
-- Depends: 01_schema.sql, 08_chat.sql, 16_push_tokens.sql,
--           17_safety_and_locations.sql, 23_ride_negotiations.sql
-- ============================================================

-- ── 1. COLUMN-LEVEL: hide push_token from client-side queries ─

-- Revoke the default table-level SELECT from authenticated,
-- then re-grant only the safe columns.
-- NOTE: The existing "profiles_read" RLS policy continues to
-- filter rows; this controls which columns are visible.

revoke select on public.profiles from authenticated;
grant  select (
  id, full_name, phone, role, avatar_url, rating, total_trips,
  created_at, referral_code, referred_by,
  emergency_contact_name, emergency_contact_phone
) on public.profiles to authenticated;

-- Writes (INSERT/UPDATE) remain unrestricted at the column level;
-- RLS policies already enforce that users can only write their own row.
grant insert, update on public.profiles to authenticated;

-- ── 2. LENGTH CONSTRAINTS on free-text columns ────────────────

-- profiles
alter table public.profiles
  add constraint if not exists chk_profiles_full_name_len
    check (char_length(full_name) <= 100),
  add constraint if not exists chk_profiles_phone_len
    check (char_length(phone) <= 30),
  add constraint if not exists chk_profiles_ecname_len
    check (char_length(emergency_contact_name) <= 100),
  add constraint if not exists chk_profiles_ecphone_len
    check (char_length(emergency_contact_phone) <= 30);

-- rides
alter table public.rides
  add constraint if not exists chk_rides_pickup_address_len
    check (char_length(pickup_address) <= 300),
  add constraint if not exists chk_rides_destination_address_len
    check (char_length(destination_address) <= 300),
  add constraint if not exists chk_rides_passenger_note_len
    check (char_length(passenger_note) <= 280),
  add constraint if not exists chk_rides_offered_price_range
    check (offered_price between 1.00 and 9999.00);

-- chat_messages
alter table public.chat_messages
  add constraint if not exists chk_chat_body_len
    check (char_length(body) <= 1000);

-- ride_negotiations (offered_price > 0 already set; add ceiling)
alter table public.ride_negotiations
  add constraint if not exists chk_negotiation_price_max
    check (offered_price <= 9999.00);

-- trips (marketplace)
alter table public.trips
  add constraint if not exists chk_trips_description_len
    check (char_length(description) <= 500),
  add constraint if not exists chk_trips_origin_len
    check (char_length(origin_address) <= 300),
  add constraint if not exists chk_trips_destination_len
    check (char_length(destination_address) <= 300),
  add constraint if not exists chk_trips_price_max
    check (price_per_seat <= 9999.00);

-- saved_locations
alter table public.saved_locations
  add constraint if not exists chk_saved_locations_label_len
    check (char_length(label) <= 100),
  add constraint if not exists chk_saved_locations_address_len
    check (char_length(address) <= 300);

-- ── 3. TIGHTEN drivers UPDATE policy ─────────────────────────
-- Prevent drivers from self-setting is_verified / subscription_active.
-- These fields are only updated by the platform (service role).

drop policy if exists "drivers_write_self" on public.drivers;

-- Drivers can INSERT their own row freely (initial setup)
drop policy if exists "drivers_insert_self" on public.drivers;
create policy "drivers_insert_self"
  on public.drivers for insert
  with check (auth.uid() = user_id);

-- Drivers can SELECT their own row and all online drivers (for passenger matching)
-- (existing "drivers_read" policy covers SELECT; no change needed)

-- Drivers can UPDATE their own row EXCEPT is_verified and subscription_active
drop policy if exists "drivers_update_self" on public.drivers;
create policy "drivers_update_self"
  on public.drivers for update
  using  (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- is_verified and subscription_active must remain unchanged
    and is_verified         = (select is_verified         from public.drivers where user_id = auth.uid())
    and subscription_active = (select subscription_active from public.drivers where user_id = auth.uid())
  );

-- ── 4. RLS AUDIT SUMMARY ─────────────────────────────────────
-- All 14+ tables verified:
--   profiles              RLS ON  ✓  row-level + column-level after this migration
--   drivers               RLS ON  ✓  split insert/update; verified/sub fields protected
--   rides                 RLS ON  ✓  passenger+driver scoped
--   ride_bids             RLS ON  ✓  driver insert, participant read
--   chat_messages         RLS ON  ✓  participants only, active-ride insert guard
--   ride_ratings          RLS ON  ✓  split driver/passenger read (migration 11)
--   ride_negotiations     RLS ON  ✓  driver/passenger separated
--   shared_ride_groups    RLS ON  ✓  driver-only update (migration 24)
--   trips                 RLS ON  ✓  marketplace read, driver write
--   trip_seat_bookings    RLS ON  ✓  participant read, passenger insert
--   saved_locations       RLS ON  ✓  self-only
--   pickup_codes          RLS ON  ✓  passenger read only; driver via SECURITY DEFINER RPC
--   rate_limit_log        RLS OFF ✓  internal table; only touched by SECURITY DEFINER fns
--   push_tokens           N/A     ✓  push_token column in profiles; revoked from authenticated