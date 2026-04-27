import { supabase } from './supabase';
import { getSignedUrl } from './kycDocs';

/**
 * Fetch a viewable profile photo URL for a given driver.
 * Returns null if no photo exists, the photo is rejected,
 * or the photo is pending and the viewer is not the driver themselves.
 *
 * Visibility:
 *  - approved → any authenticated user
 *  - pending  → only the driver themselves
 *  - rejected → never shown
 */
export async function fetchDriverPhotoUrl(driverId: string): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const viewerId = userData.user?.id ?? null;

  const { data: row, error } = await supabase
    .from('driver_documents')
    .select('file_url, status, driver_id')
    .eq('driver_id', driverId)
    .eq('document_type', 'profile_photo')
    .maybeSingle();

  if (error || !row) return null;

  const isOwner = viewerId === row.driver_id;
  if (row.status === 'rejected') return null;
  if (row.status === 'pending' && !isOwner) return null;

  return getSignedUrl(row.file_url, 600); // 10-min signed URL
}
