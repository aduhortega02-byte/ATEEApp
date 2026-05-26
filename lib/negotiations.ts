import { supabase } from './supabase';
import { notifyUser } from './notifications';
import type { RideNegotiation } from './types';

export type { RideNegotiation } from './types';

/** Driver sends a counter-offer to the passenger. */
export async function sendDriverCounter(
  rideId: string,
  passengerId: string,
  offeredPrice: number,
  round: number,
): Promise<RideNegotiation> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('ride_negotiations')
    .insert({ ride_id: rideId, driver_id: auth.user.id, passenger_id: passengerId, offered_price: offeredPrice, round, created_by: 'driver' })
    .select()
    .single();
  if (error) throw error;
  notifyUser(passengerId, 'New counter offer', `Driver offered $${offeredPrice.toFixed(2)} — tap to respond.`);
  return data as RideNegotiation;
}

/** Passenger counters back to a specific driver. */
export async function sendPassengerCounter(
  rideId: string,
  driverId: string,
  offeredPrice: number,
  round: number,
): Promise<RideNegotiation> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('ride_negotiations')
    .insert({ ride_id: rideId, driver_id: driverId, passenger_id: auth.user.id, offered_price: offeredPrice, round, created_by: 'passenger' })
    .select()
    .single();
  if (error) throw error;
  notifyUser(driverId, 'Passenger countered', `Passenger offered $${offeredPrice.toFixed(2)} — tap to respond.`);
  return data as RideNegotiation;
}

/**
 * Passenger accepts a driver's counter-offer.
 * Sets negotiation → accepted (trigger auto-cancels all others),
 * then locks the ride to that driver at the negotiated price.
 */
export async function acceptNegotiation(negotiationId: string): Promise<void> {
  const { data: neg, error: fetchErr } = await supabase
    .from('ride_negotiations')
    .select('*')
    .eq('id', negotiationId)
    .single();
  if (fetchErr || !neg) throw fetchErr ?? new Error('Negotiation not found');

  const { error: negErr } = await supabase
    .from('ride_negotiations')
    .update({ status: 'accepted' })
    .eq('id', negotiationId);
  if (negErr) throw negErr;

  const { error: rideErr } = await supabase
    .from('rides')
    .update({ offered_price: neg.offered_price, driver_id: neg.driver_id, status: 'driver_assigned' })
    .eq('id', neg.ride_id);
  if (rideErr) throw rideErr;

  const priceStr = `$${(neg.offered_price as number).toFixed(2)}`;
  notifyUser(neg.passenger_id, 'Ride confirmed!', `Counter accepted — ride locked in at ${priceStr}.`);
  notifyUser(neg.driver_id,    'Offer accepted!', `Passenger accepted your offer of ${priceStr}. Head to pickup.`);
}

/** Passenger declines a specific counter-offer. */
export async function declineNegotiation(negotiationId: string): Promise<void> {
  const { error } = await supabase
    .from('ride_negotiations')
    .update({ status: 'declined' })
    .eq('id', negotiationId);
  if (error) throw error;
}

/** Driver (or passenger) cancels their own pending offer. */
export async function cancelNegotiation(negotiationId: string): Promise<void> {
  const { error } = await supabase
    .from('ride_negotiations')
    .update({ status: 'cancelled' })
    .eq('id', negotiationId);
  if (error) throw error;
}

/** Fetch full negotiation thread for a ride (passenger view — all drivers). */
export async function fetchNegotiationsForRide(rideId: string): Promise<RideNegotiation[]> {
  const { data, error } = await supabase
    .from('ride_negotiations')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RideNegotiation[];
}

/** Fetch negotiation thread between this ride and one driver. */
export async function fetchDriverNegotiations(rideId: string, driverId: string): Promise<RideNegotiation[]> {
  const { data, error } = await supabase
    .from('ride_negotiations')
    .select('*')
    .eq('ride_id', rideId)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RideNegotiation[];
}
