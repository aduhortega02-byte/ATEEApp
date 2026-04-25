-- ============================================================
-- Migration: 02_driver_documents
-- Purpose:   KYC document storage and auto-verification trigger
-- Depends:   01_schema.sql (profiles, drivers tables must exist)
-- ============================================================

create type document_type_enum as enum (
  'drivers_license',
  'vehicle_registration',
  'vehicle_insurance',
  'profile_photo'
);

create type document_status_enum as enum (
  'pending',
  'approved',
  'rejected'
);

-- ── TABLE ────────────────────────────────────────────────────

create table if not exists public.driver_documents (
  id               uuid                 primary key default uuid_generate_v4(),

  -- References profiles.id (= auth.users.id).
  -- Both drivers.user_id and driver_documents.driver_id point to profiles.id.
  driver_id        uuid                 not null
                                        references public.profiles(id)
                                        on delete cascade,

  document_type    document_type_enum   not null,
  file_url         text                 not null,   -- Supabase Storage public URL

  -- Admin review
  status           document_status_enum not null default 'pending',
  rejection_reason text,                            -- set when status = 'rejected'
  reviewed_by      uuid                 references public.profiles(id),
  reviewed_at      timestamptz,

  -- Expiry tracking (license, insurance)
  expires_at       timestamptz,

  uploaded_at      timestamptz          not null default now(),

  -- One active row per document type per driver.
  -- Re-uploading uses upsert on (driver_id, document_type).
  constraint uq_driver_document_type unique (driver_id, document_type)
);

-- ── INDEXES ──────────────────────────────────────────────────

create index if not exists idx_driver_docs_driver_id
  on public.driver_documents (driver_id);

create index if not exists idx_driver_docs_status
  on public.driver_documents (status);

create index if not exists idx_driver_docs_type
  on public.driver_documents (document_type);

-- Fast admin queue: pending docs ordered by upload time
create index if not exists idx_driver_docs_pending
  on public.driver_documents (uploaded_at)
  where status = 'pending';

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.driver_documents enable row level security;

-- Driver: read own documents only
drop policy if exists "docs_driver_select" on public.driver_documents;
create policy "docs_driver_select"
  on public.driver_documents
  for select
  using (auth.uid() = driver_id);

-- Driver: insert own documents only
drop policy if exists "docs_driver_insert" on public.driver_documents;
create policy "docs_driver_insert"
  on public.driver_documents
  for insert
  with check (auth.uid() = driver_id);

-- Driver: may re-upload (update file_url) only while status = 'pending'.
-- Once admin sets approved/rejected, driver cannot overwrite the decision.
drop policy if exists "docs_driver_update" on public.driver_documents;
create policy "docs_driver_update"
  on public.driver_documents
  for update
  using  (auth.uid() = driver_id and status = 'pending')
  with check (auth.uid() = driver_id and status = 'pending');

-- Admin access via service-role key (bypasses RLS — no extra policy needed).

-- ── AUTO-VERIFICATION TRIGGER ────────────────────────────────
-- Fires after INSERT or UPDATE on status.
-- When all 3 required docs are 'approved' → drivers.is_verified = true.
-- If any required doc is rejected/re-uploaded → is_verified = false.

create or replace function public.sync_driver_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id      uuid;
  v_approved_count int;
  v_required_count constant int := 3;
begin
  v_driver_id := coalesce(new.driver_id, old.driver_id);

  select count(*)
    into v_approved_count
    from public.driver_documents
   where driver_id    = v_driver_id
     and document_type in (
           'drivers_license',
           'vehicle_registration',
           'vehicle_insurance'
         )
     and status = 'approved';

  update public.drivers
     set is_verified = (v_approved_count = v_required_count)
   where user_id = v_driver_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_driver_verification
  on public.driver_documents;

create trigger trg_sync_driver_verification
  after insert or update of status
  on public.driver_documents
  for each row
  execute function public.sync_driver_verification();

-- ── REALTIME ─────────────────────────────────────────────────
-- Lets the driver's KYC screen update live when admin approves a doc.
alter publication supabase_realtime
  add table public.driver_documents;
