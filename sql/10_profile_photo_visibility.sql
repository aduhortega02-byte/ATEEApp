-- ============================================================
-- Migration: 10_profile_photo_visibility
-- Purpose: allow authenticated users to read OTHER drivers' approved profile photos.
--   - Drivers continue to read all their own documents (existing policy unchanged).
--   - Other authenticated users may only read documents where
--     document_type='profile_photo' AND status='approved'.
-- Depends: 02_driver_documents.sql
-- ============================================================

-- The existing docs_driver_select policy stays (driver reads their own).
-- We ADD an additional, non-conflicting policy: anyone authenticated can read
-- approved profile photos.

drop policy if exists "docs_approved_profile_photo_public_read" on public.driver_documents;
create policy "docs_approved_profile_photo_public_read"
  on public.driver_documents for select
  using (
    document_type = 'profile_photo'
    and status = 'approved'
    and auth.role() = 'authenticated'
  );

-- Storage: authenticated users can read objects whose path contains
-- '/profile_photo-'. The DB-level approval check in the app is the real gate —
-- we never generate a signed URL unless the DB query above returns an approved row.

drop policy if exists "kyc_profile_photo_authenticated_read" on storage.objects;
create policy "kyc_profile_photo_authenticated_read"
  on storage.objects for select
  using (
    bucket_id = 'driver-documents'
    and auth.role() = 'authenticated'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or position('/profile_photo-' in name) > 0
    )
  );
