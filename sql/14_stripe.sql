-- ============================================================
-- Migration: 14_stripe
-- Purpose: Add Stripe card payment + Connect payout support
-- Depends: 01_schema.sql, 06_cash_payments.sql, 13_trips_marketplace.sql
-- ============================================================

-- ── 1. Add 'card' to payment_method_enum ────────────────────
alter type payment_method_enum add value if not exists 'card';

-- ── 2. Add Stripe fields to profiles ────────────────────────
alter table public.profiles
  add column if not exists stripe_account_id      text,          -- Stripe Connect express account
  add column if not exists stripe_connect_enabled boolean not null default false;

-- ── 3. Add Stripe fields to rides ────────────────────────────
alter table public.rides
  add column if not exists stripe_payment_intent_id text unique;

-- ── 4. Add Stripe fields to trip_seat_bookings ───────────────
alter table public.trip_seat_bookings
  add column if not exists stripe_payment_intent_id text unique;

-- ── 5. Indexes ────────────────────────────────────────────────
create index if not exists idx_rides_stripe_pi
  on public.rides (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_bookings_stripe_pi
  on public.trip_seat_bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
