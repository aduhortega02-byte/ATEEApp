// Edge Function: stripe-payment-intent
// Creates a Stripe PaymentIntent for a ride or marketplace booking.
// Required secrets (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // @ts-ignore — Deno-compatible fetch
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { ride_id, booking_id } = await req.json();

    let amountCents: number;
    let driverStripeAccountId: string | null = null;
    let description: string;

    if (ride_id) {
      // On-demand ride
      const { data: ride, error } = await supabase
        .from('rides')
        .select('id, offered_price, driver_id, stripe_payment_intent_id')
        .eq('id', ride_id)
        .eq('passenger_id', user.id)
        .single();
      if (error || !ride) return json({ error: 'Ride not found' }, 404);
      if (ride.stripe_payment_intent_id) {
        // Already created — retrieve and return existing client_secret
        const pi = await stripe.paymentIntents.retrieve(ride.stripe_payment_intent_id);
        return json({ client_secret: pi.client_secret });
      }
      amountCents = Math.round(Number(ride.offered_price) * 100);
      description = `ATEE ride ${ride_id.slice(0, 8)}`;
      if (ride.driver_id) {
        const { data: driverProfile } = await supabase
          .from('profiles')
          .select('stripe_account_id, stripe_connect_enabled')
          .eq('id', ride.driver_id)
          .single();
        if (driverProfile?.stripe_connect_enabled && driverProfile.stripe_account_id) {
          driverStripeAccountId = driverProfile.stripe_account_id;
        }
      }
    } else if (booking_id) {
      // Marketplace seat booking
      const { data: booking, error } = await supabase
        .from('trip_seat_bookings')
        .select('id, total_price, trip_id, stripe_payment_intent_id')
        .eq('id', booking_id)
        .eq('passenger_id', user.id)
        .single();
      if (error || !booking) return json({ error: 'Booking not found' }, 404);
      if (booking.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        return json({ client_secret: pi.client_secret });
      }
      amountCents = Math.round(Number(booking.total_price) * 100);
      description = `ATEE trip booking ${booking_id.slice(0, 8)}`;
      // Get driver from the trip
      const { data: trip } = await supabase
        .from('trips')
        .select('driver_id')
        .eq('id', booking.trip_id)
        .single();
      if (trip?.driver_id) {
        const { data: driverProfile } = await supabase
          .from('profiles')
          .select('stripe_account_id, stripe_connect_enabled')
          .eq('id', trip.driver_id)
          .single();
        if (driverProfile?.stripe_connect_enabled && driverProfile.stripe_account_id) {
          driverStripeAccountId = driverProfile.stripe_account_id;
        }
      }
    } else {
      return json({ error: 'Provide ride_id or booking_id' }, 400);
    }

    if (amountCents! < 50) return json({ error: 'Amount too small' }, 400);

    // Build PaymentIntent params
    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: amountCents!,
      currency: 'usd',
      description,
      metadata: {
        ...(ride_id ? { ride_id } : {}),
        ...(booking_id ? { booking_id } : {}),
        passenger_id: user.id,
      },
    };

    // If driver has Connect, route payment to their account (platform takes 10%)
    if (driverStripeAccountId) {
      const platformFeeCents = Math.round(amountCents! * 0.10);
      piParams.transfer_data = { destination: driverStripeAccountId };
      piParams.application_fee_amount = platformFeeCents;
    }

    const pi = await stripe.paymentIntents.create(piParams);

    // Save payment_intent_id to DB
    if (ride_id) {
      await supabase
        .from('rides')
        .update({ stripe_payment_intent_id: pi.id })
        .eq('id', ride_id);
    } else if (booking_id) {
      await supabase
        .from('trip_seat_bookings')
        .update({ stripe_payment_intent_id: pi.id })
        .eq('id', booking_id);
    }

    return json({ client_secret: pi.client_secret });
  } catch (err: any) {
    console.error('[stripe-payment-intent]', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
