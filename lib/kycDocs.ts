import { supabase } from './supabase';

export type DocumentType =
  | 'profile_photo'
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance';

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export type DriverDocument = {
  id: string;
  driver_id: string;
  document_type: DocumentType;
  file_url: string;
  status: DocumentStatus;
  rejection_reason: string | null;
  expires_at: string | null;
  uploaded_at: string;
};

const BUCKET = 'driver-documents';

export async function uploadDocument(
  file: Blob | File,
  fileName: string,
  documentType: DocumentType,
): Promise<DriverDocument> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');
  const uid = userData.user.id;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const objectPath = `${uid}/${documentType}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw uploadErr;

  const { data: existingRow } = await supabase
    .from('driver_documents')
    .select('id, file_url')
    .eq('driver_id', uid)
    .eq('document_type', documentType)
    .maybeSingle();

  if (existingRow?.file_url) {
    await supabase.storage.from(BUCKET).remove([existingRow.file_url]).catch(() => {});
  }

  const { data, error: dbErr } = await supabase
    .from('driver_documents')
    .upsert(
      {
        driver_id: uid,
        document_type: documentType,
        file_url: objectPath,
        status: 'pending',
        rejection_reason: null,
      },
      { onConflict: 'driver_id,document_type' },
    )
    .select()
    .single();
  if (dbErr) throw dbErr;
  return data as DriverDocument;
}

export async function getSignedUrl(objectPath: string, expiresIn = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function fetchMyDocuments(): Promise<DriverDocument[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from('driver_documents')
    .select('*')
    .eq('driver_id', userData.user.id)
    .order('document_type', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DriverDocument[];
}

export async function deleteDocument(documentId: string, objectPath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([objectPath]).catch(() => {});
  const { error } = await supabase.from('driver_documents').delete().eq('id', documentId);
  if (error) throw error;
}
