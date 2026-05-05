// lib/rides.ts
// All ride-related Supabase calls. Import these in your screens.

import { supabase } from './supabase';
import type { Ride, RideBid, RideStatus, PaymentMethod, RidePaymentStatus } from './types';

export type { Ride, RideBid, RideStatus, PaymentMethod, RidePaymentStatus } from './types';

// ──────────────────────────────────────────────────────────────
// PASSENGER SIDE
// ──────────────────────────────────────────────────────────────

/**
 * Passenger creates a new ride request.
 * Called from BookScreen when user taps "Request Drivers".
 */
export async function createRide(params: {
  pickup_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  destination_address: string;
  destination_lat?: number;
  destination_lng?: number;
  offered_price: number;
  distance_mi?: number;
  eta_min?: number;
  scheduled_for?: string;
  payment_method: PaymentMethod;
  passenger_note?: string | null;
}): Promise<Ride> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('rides')
    .insert({
      passenger_id: user.user.id,
      status: 'matching',
      ...params,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Ride;
}

/**
 * Passenger picks one of the bidding drivers.
 * Updates ride.driver_id and flips ride to 'driver_assigned'.
 * Also marks the chosen bid and rejects the rest.
 */
export async function chooseDriver(rideId: string, driverId: string) {
  // Assign driver on the ride
  const { error: rideErr } = await supabase
    .from('rides')
    .update({ driver_id: driverId, status: 'driver_assigned' })
    .eq('id', rideId);
  if (rideErr) throw rideErr;

  // Mark chosen bid
  const { error: chosenErr } = await supabase
    .from('ride_bids')
    .update({ status: 'chosen' })
    .eq('ride_id', rideId)
    .eq('driver_id', driverId);
  if (chosenErr) throw chosenErr;

  // Reject the rest
  const { error: restErr } = await supabase
    .from('ride_bids')
    .update({ status: 'rejected' })
    .eq('ride_id', rideId)
    .neq('driver_id', driverId);
  if (restErr) throw restErr;
}

/**
 * Passenger cancels their ride.
 */
export async function cancelRide(rideId: string) {
  const { error } = await supabase
    .from('rides')
    .update({ status: 'cancelled' })
    .eq('id', rideId);
  if (error) throw error;
}

/**
 * Fetch all current bids for a ride, with driver profile info joined.
 */
export async function fetchBidsForRide(rideId: string): Promise<RideBid[]> {
  const { data, error } = await supabase
    .from('ride_bids')
    .select(`
      *,
      driver:profiles!ride_bids_driver_id_fkey (
        full_name, avatar_url, rating, total_trips
      )
    `)
    .eq('ride_id', rideId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data ?? []) as RideBid[];
}

// ──────────────────────────────────────────────────────────────
// DRIVER SIDE
// ──────────────────────────────────────────────────────────────

/**
 * Driver toggles online/offline. Passengers' queue updates in realtime.
 */
export async function setDriverOnline(online: boolean, lat?: number, lng?: number) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const payload: {
    is_online: boolean;
    last_seen: string;
    current_lat?: number;
    current_lng?: number;
  } = { is_online: online, last_seen: new Date().toISOString() };
  if (lat !== undefined) payload.current_lat = lat;
  if (lng !== undefined) payload.current_lng = lng;

  const { error } = await supabase
    .from('drivers')
    .upsert({ user_id: user.user.id, ...payload }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Driver accepts a ride request at the passenger's offered price.
 * Creates a ride_bid row. The passenger sees it appear in realtime.
 */
export async function acceptRide(rideId: string, etaMin: number) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('ride_bids')
    .insert({ ride_id: rideId, driver_id: user.user.id, eta_min: etaMin })
    .select()
    .single();
  if (error) throw error;
  return data as RideBid;
}

/**
 * Driver declines a request (we just skip it — nothing to write).
 * If you want analytics on declines, insert a 'rejected' bid here.
 */
export async function declineRide(_rideId: string) {
  return; // no-op for now
}

/**
 * Driver fetches currently available ride requests.
 * Used by DriverHomeScreen when they come online.
 */
export async function fetchAvailableRides(): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('status', 'matching')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Ride[];
}

/**
 * Driver marks an assigned ride as in-progress (they arrived at pickup).
 */
export async function startRide(rideId: string) {
  const { error } = await supabase
    .from('rides')
    .update({ status: 'in_progress' })
    .eq('id', rideId);
  if (error) throw error;
}

/**
 * Driver marks a ride as completed.
 */
export async function completeRide(rideId: string) {
  const { error } = await supabase
    .from('rides')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', rideId);
  if (error) throw error;
}

/**
 * Driver completes a ride and records whether the passenger paid or disputed.
 * The DB trigger update_wallet_on_ride_complete fires and updates the wallet.
 */
export async function completeRideWithPayment(
  rideId: string,
  paymentStatus: 'paid' | 'disputed',
) {
  const { error } = await supabase
    .from('rides')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      payment_status: paymentStatus,
    })
    .eq('id', rideId);
  if (error) throw error;
}
