import { supabase } from './supabase';

export type RideRating = {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
};

export async function submitRating(params: {
  rideId: string;
  driverId: string;
  stars: number;
  comment?: string;
}): Promise<RideRating> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('ride_ratings')
    .insert({
      ride_id: params.rideId,
      passenger_id: userData.user.id,
      driver_id: params.driverId,
      stars: params.stars,
      comment: params.comment ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RideRating;
}

export async function fetchRatingForRide(rideId: string): Promise<RideRating | null> {
  const { data, error } = await supabase
    .from('ride_ratings')
    .select('*')
    .eq('ride_id', rideId)
    .maybeSingle();
  if (error) throw error;
  return (data as RideRating) ?? null;
}
