import { supabase } from './supabase';

export type SavedLocation = {
  id: string;
  user_id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  created_at: string;
};

export async function fetchSavedLocations(): Promise<SavedLocation[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from('saved_locations')
    .select('*')
    .eq('user_id', u.user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SavedLocation[];
}

// Upserts by label — enforces one entry per label per user.
export async function upsertSavedLocation(input: {
  label: string;
  address: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  // Delete existing with the same label first (idempotent upsert by label)
  await supabase
    .from('saved_locations')
    .delete()
    .eq('user_id', u.user.id)
    .eq('label', input.label);
  const { error } = await supabase.from('saved_locations').insert({
    user_id: u.user.id,
    ...input,
  });
  if (error) throw error;
}

export async function deleteSavedLocation(id: string): Promise<void> {
  const { error } = await supabase.from('saved_locations').delete().eq('id', id);
  if (error) throw error;
}
