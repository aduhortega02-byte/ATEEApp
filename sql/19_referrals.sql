-- Migration 19: Referral codes and tracking

-- Add referral_code (auto-generated, unique) and referred_by to profiles
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Back-fill referral codes for existing profiles
update public.profiles
set referral_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

-- Trigger function: auto-assign a referral code on new profile insert
create or replace function public.handle_profile_referral_code()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists set_profile_referral_code on public.profiles;
create trigger set_profile_referral_code
  before insert on public.profiles
  for each row execute function public.handle_profile_referral_code();

-- RPC: safely apply a referral code (enforces one-time, no self-referral)
create or replace function public.apply_referral_code(p_code text)
returns text
language plpgsql
security definer
as $$
declare
  v_referrer_id uuid;
  v_already_referred uuid;
begin
  -- Look up referrer by code (case-insensitive)
  select id into v_referrer_id
  from public.profiles
  where referral_code = upper(trim(p_code))
  limit 1;

  if v_referrer_id is null then
    return 'invalid_code';
  end if;

  -- Prevent self-referral
  if v_referrer_id = auth.uid() then
    return 'self_referral';
  end if;

  -- Check if already referred
  select referred_by into v_already_referred
  from public.profiles
  where id = auth.uid();

  if v_already_referred is not null then
    return 'already_referred';
  end if;

  -- Apply
  update public.profiles
  set referred_by = v_referrer_id
  where id = auth.uid();

  return 'success';
end;
$$;

-- Count referrals: how many users were referred by a given user_id
create or replace function public.count_my_referrals()
returns bigint
language sql
security definer
as $$
  select count(*) from public.profiles where referred_by = auth.uid();
$$;

-- Index for fast referral code lookups
create index if not exists idx_profiles_referral_code on public.profiles(referral_code);
create index if not exists idx_profiles_referred_by on public.profiles(referred_by);
