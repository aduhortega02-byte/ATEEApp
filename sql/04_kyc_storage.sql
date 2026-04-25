-- ============================================================
-- Migration: 04_kyc_storage
-- Purpose:   Storage bucket + policies for driver KYC documents
-- Depends:   02_driver_documents.sql
-- ============================================================

-- Create the bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760, -- 10 MB max per file
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Path convention: {driver_id}/{document_type}-{timestamp}.{ext}

-- ── STORAGE RLS POLICIES ─────────────────────────────────────

drop policy if exists "kyc_driver_upload" on storage.objects;
create policy "kyc_driver_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "kyc_driver_read" on storage.objects;
create policy "kyc_driver_read"
  on storage.objects for select
  using (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "kyc_driver_update" on storage.objects;
create policy "kyc_driver_update"
  on storage.objects for update
  using (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "kyc_driver_delete" on storage.objects;
create policy "kyc_driver_delete"
  on storage.objects for delete
  using (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
