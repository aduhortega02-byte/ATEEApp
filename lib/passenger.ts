import { supabase } from './supabase';
import type { Ride } from './types';

export async function fetchRecentRidesForPassenger(limit = 20): Promise<Ride[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', user.user.id)
    .in('status', ['completed', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Ride[];
}

export async function fetchDriverRides(limit = 20): Promise<Ride[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', user.user.id)
    .in('status', ['completed', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Ride[];
}
