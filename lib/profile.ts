import { supabase } from './supabase';
import type { Profile } from './types';

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.user.id)
    .single();

  if (error) throw error;
  return data as Profile;
}
