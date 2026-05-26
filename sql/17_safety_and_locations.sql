-- Migration 17: Emergency contacts + saved passenger locations

-- Emergency contact on every user's profile
alter table public.profiles
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- Saved locations (Home, Work, custom labels)
create table if not exists public.saved_locations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  label      text        not null,            -- 'home', 'work', or custom
  address    text        not null,
  lat        float8      not null,
  lng        float8      not null,
  created_at timestamptz not null default now()
);

alter table public.saved_locations enable row level security;

create policy "Users manage own saved locations"
  on public.saved_locations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.saved_locations;
