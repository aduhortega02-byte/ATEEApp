-- ============================================================
-- Migration: 08_chat
-- Purpose: in-ride chat between passenger and driver
-- Depends: 01_schema.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_message_type_enum') then
    create type chat_message_type_enum as enum ('text', 'location', 'quick_reply');
  end if;
end $$;

create table if not exists public.chat_messages (
  id           uuid primary key default uuid_generate_v4(),
  ride_id      uuid not null references public.rides(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         chat_message_type_enum not null default 'text',
  body         text,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

create index if not exists idx_chat_ride on public.chat_messages(ride_id, created_at);
create index if not exists idx_chat_recipient_unread on public.chat_messages(recipient_id) where read_at is null;

-- ── RLS ──────────────────────────────────────────────────────

alter table public.chat_messages enable row level security;

drop policy if exists "chat_participants_read" on public.chat_messages;
create policy "chat_participants_read"
  on public.chat_messages for select
  using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
  );

drop policy if exists "chat_participants_insert" on public.chat_messages;
create policy "chat_participants_insert"
  on public.chat_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.rides r
       where r.id = ride_id
         and r.status in ('driver_assigned', 'in_progress')
         and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
         and (
           (r.passenger_id = auth.uid() and r.driver_id = recipient_id)
           or (r.driver_id = auth.uid() and r.passenger_id = recipient_id)
         )
    )
  );

drop policy if exists "chat_recipient_mark_read" on public.chat_messages;
create policy "chat_recipient_mark_read"
  on public.chat_messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- ── Realtime ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.chat_messages;
