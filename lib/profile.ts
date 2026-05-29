import { supabase } from './supabase';
import type { Profile } from './types';
import { sanitizeText, validatePhone, validateFullName } from './sanitize';

export async function fetchProfileById(userId: string): Promise<Pick<Profile, 'id' | 'full_name' | 'rating' | 'total_trips' | 'phone'> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, rating, total_trips, phone')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Pick<Profile, 'id' | 'full_name' | 'rating' | 'total_trips' | 'phone'> | null;
}

export async function updateMyProfile(fields: {
  full_name?: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');

  const clean: typeof fields = {};

  if (fields.full_name !== undefined) {
    const err = validateFullName(fields.full_name);
    if (err) throw new Error(err);
    clean.full_name = sanitizeText(fields.full_name, 100);
  }
  if (fields.emergency_contact_name !== undefined) {
    clean.emergency_contact_name = fields.emergency_contact_name
      ? sanitizeText(fields.emergency_contact_name, 100)
      : null;
  }
  if (fields.emergency_contact_phone !== undefined) {
    if (fields.emergency_contact_phone) {
      const err = validatePhone(fields.emergency_contact_phone);
      if (err) throw new Error(err);
    }
    clean.emergency_contact_phone = fields.emergency_contact_phone
      ? fields.emergency_contact_phone.trim().slice(0, 30)
      : null;
  }

  const { error } = await supabase.from('profiles').update(clean).eq('id', u.user.id);
  if (error) throw error;
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
