-- ============================================================
-- Migration: 10_pickup_verification
-- Purpose: Generate and verify 4-digit pickup codes for rides.
--          Passenger sees the code; driver enters it at pickup.
--          Code is verified server-side so the driver never reads
--          the raw value directly.
-- Depends: 01_schema.sql
-- ============================================================

create table if not exists public.pickup_codes (
  ride_id    uuid primary key references public.rides(id) on delete cascade,
  code       text not null check (code ~ '^\d{4}$'),
  attempts   int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pickup_codes enable row level security;

-- Only the passenger of the ride can read their own code
drop policy if exists "pickup_codes_passenger_read" on public.pickup_codes;
create policy "pickup_codes_passenger_read"
  on public.pickup_codes for select
  using (
    exists (
      select 1 from public.rides r
       where r.id = pickup_codes.ride_id
         and r.passenger_id = auth.uid()
    )
  );

-- ── TRIGGER: generate code when ride becomes driver_assigned ──

create or replace function public.generate_pickup_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'driver_assigned'
     and (old.status is distinct from 'driver_assigned') then
    insert into public.pickup_codes (ride_id, code)
    values (
      new.id,
      lpad(floor(random() * 10000)::text, 4, '0')
    )
    on conflict (ride_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_pickup_code on public.rides;
create trigger trg_generate_pickup_code
  after update on public.rides
  for each row execute function public.generate_pickup_code();

-- ── RPC: driver verifies code (SECURITY DEFINER so driver ─────
--         cannot read pickup_codes directly)                  ──

create or replace function public.verify_pickup_code(
  p_ride_id uuid,
  p_code    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_attempts  int;
  v_driver_id uuid;
  v_status    text;
begin
  select driver_id, status
    into v_driver_id, v_status
    from public.rides
   where id = p_ride_id;

  if v_driver_id is null or v_driver_id != auth.uid() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_status != 'driver_assigned' then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select code, attempts
    into v_code, v_attempts
    from public.pickup_codes
   where ride_id = p_ride_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'code_not_found');
  end if;

  if v_attempts >= 3 then
    return jsonb_build_object('success', false, 'error', 'max_attempts');
  end if;

  if v_code = p_code then
    update public.rides set status = 'in_progress' where id = p_ride_id;
    return jsonb_build_object('success', true);
  else
    update public.pickup_codes
       set attempts = attempts + 1
     where ride_id = p_ride_id;

    v_attempts := v_attempts + 1;

    if v_attempts >= 3 then
      return jsonb_build_object('success', false, 'error', 'max_attempts');
    end if;

    return jsonb_build_object(
      'success',      false,
      'error',        'wrong_code',
      'attempts_left', 3 - v_attempts
    );
  end if;
end;
$$;

-- Realtime: passenger subscribes to see code appear
alter publication supabase_realtime add table public.pickup_codes;
