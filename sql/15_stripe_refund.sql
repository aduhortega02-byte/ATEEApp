-- Migration: 15_stripe_refund
-- Purpose: Add 'refunded' to ride_payment_status_enum
-- Depends: 06_cash_payments.sql

alter type ride_payment_status_enum add value if not exists 'refunded';
