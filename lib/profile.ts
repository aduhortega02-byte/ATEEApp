import { supabase } from './supabase';
import type { Profile } from './types';

export async function fetchProfileById(userId: string): Promise<Pick<Profile, 'id' | 'full_name' | 'rating' | 'total_trips'> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, rating, total_trips')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Pick<Profile, 'id' | 'full_name' | 'rating' | 'total_trips'> | null;
}

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
