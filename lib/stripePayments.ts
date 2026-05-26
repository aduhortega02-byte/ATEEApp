import { Linking } from 'react-native';
import { supabase } from './supabase';

const FUNCTIONS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

async function callFunction<T>(name: string, body: object): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `${name} failed (${res.status})`);
  return json as T;
}

export async function createRidePaymentIntent(rideId: string): Promise<string> {
  const { client_secret } = await callFunction<{ client_secret: string }>(
    'stripe-payment-intent',
    { ride_id: rideId },
  );
  return client_secret;
}

export async function createBookingPaymentIntent(bookingId: string): Promise<string> {
  const { client_secret } = await callFunction<{ client_secret: string }>(
    'stripe-payment-intent',
    { booking_id: bookingId },
  );
  return client_secret;
}

export type RefundResult = { cancelled: boolean; refunded: boolean; note?: string };

export async function cancelAndRefundRide(rideId: string): Promise<RefundResult> {
  return callFunction<RefundResult>('stripe-refund', { ride_id: rideId });
}

export async function startConnectOnboarding(): Promise<void> {
  const { url } = await callFunction<{ url: string }>('stripe-connect-onboard', {});
  if (url) await Linking.openURL(url);
}
