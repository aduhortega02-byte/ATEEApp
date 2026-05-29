-- ============================================================
-- Migration: 25_rate_limiting
-- Purpose: Server-side rate limiting for abuse-prone actions.
--          Works by logging every action and counting recent
--          entries before allowing a write to proceed.
--          Enforced via BEFORE triggers on each guarded table.
-- Limits:
--   ride_create       10 per user per hour
--   negotiation_send  30 per user per hour
--   chat_message      60 per user per minute
-- Depends: 01_schema.sql, 08_chat.sql, 23_ride_negotiations.sql
-- ============================================================

-- ── 1. LOG TABLE ─────────────────────────────────────────────

create table if not exists public.rate_limit_log (
  id         bigserial    primary key,
  user_id    uuid         not null,
  action     text         not null,
  created_at timestamptz  not null default now()
);

-- Covering index for the window-count query
create index if not exists idx_rate_limit_user_action_time
  on public.rate_limit_log (user_id, action, created_at desc);

-- RLS off — this table is only ever touched by SECURITY DEFINER functions
alter table public.rate_limit_log disable row level security;

-- ── 2. CORE CHECK FUNCTION ───────────────────────────────────

create or replace function public.check_rate_limit(
  p_action text,
  p_max    int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*) into v_count
    from public.rate_limit_log
   where user_id    = v_uid
     and action     = p_action
     and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'rate_limit_exceeded'
      using detail = p_action,
            hint   = format('limit %s per %s', p_max, p_window);
  end if;

  insert into public.rate_limit_log (user_id, action)
  values (v_uid, p_action);
end;
$$;

-- ── 3. TRIGGER: ride creation (10 / hour) ────────────────────

create or replace function public.rl_ride_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('ride_create', 10, interval '1 hour');
  return new;
end;
$$;

drop trigger if exists trg_rl_ride_create on public.rides;
create trigger trg_rl_ride_create
  before insert on public.rides
  for each row execute function public.rl_ride_create();

-- ── 4. TRIGGER: negotiation send (30 / hour) ─────────────────

create or replace function public.rl_negotiation_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('negotiation_send', 30, interval '1 hour');
  return new;
end;
$$;

drop trigger if exists trg_rl_negotiation_send on public.ride_negotiations;
create trigger trg_rl_negotiation_send
  before insert on public.ride_negotiations
  for each row execute function public.rl_negotiation_send();

-- ── 5. TRIGGER: chat message (60 / minute) ───────────────────

create or replace function public.rl_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('chat_message', 60, interval '1 minute');
  return new;
end;
$$;

drop trigger if exists trg_rl_chat_message on public.chat_messages;
create trigger trg_rl_chat_message
  before insert on public.chat_messages
  for each row execute function public.rl_chat_message();

-- ── 6. CLEANUP: purge entries older than 24 hours ────────────
-- Call this from a pg_cron job or a Supabase scheduled Edge Function:
--   select public.cleanup_rate_limit_log();

create or replace function public.cleanup_rate_limit_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rate_limit_log
   where created_at < now() - interval '24 hours';
end;
$$;