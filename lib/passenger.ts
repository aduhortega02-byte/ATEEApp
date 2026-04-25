import { supabase } from './supabase';
import type { Ride } from './types';

export async function fetchRecentRidesForPassenger(limit = 5): Promise<Ride[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', user.user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Ride[];
}
