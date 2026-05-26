-- Migration 16: add push_token column to profiles
-- Stores the Expo push token so edge functions can send notifications to any user.

alter table public.profiles
  add column if not exists push_token text;
