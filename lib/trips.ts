import { supabase } from './supabase';

export type TripStatus = 'active' | 'departed' | 'completed' | 'cancelled';

export type Trip = {
  id: string;
  driver_id: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  departure_at: string;
  seats_total: number;
  seats_available: number;
  price_per_seat: number;
  description: string | null;
  status: TripStatus;
  distance_mi: number | null;
  eta_min: number | null;
  created_at: string;
  updated_at: string;
};

export type PostTripInput = {
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  departure_at: string;
  seats_total: number;
  price_per_seat: number;
  description?: string;
  distance_mi?: number;
  eta_min?: number;
};

export type TripFilters = {
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
};

export async function postTrip(input: PostTripInput): Promise<Trip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('trips')
    .insert({
      driver_id: user.id,
      seats_available: input.seats_total,
      ...input,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Trip;
}

export async function fetchAvailableTrips(_filters?: TripFilters): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'active')
    .gt('seats_available', 0)
    .gte('departure_at', new Date().toISOString())
    .order('departure_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function fetchMyPostedTrips(): Promise<Trip[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('driver_id', user.id)
    .order('departure_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function cancelTrip(tripId: string): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tripId);

  if (error) throw error;
}

export async function fetchTripById(tripId: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (error) return null;
  return data as Trip;
}
