// Edge Function: stripe-refund
// Cancels a ride and, when the ride was paid by card, reconciles with Stripe:
//   - PI status 'succeeded'         → issue a full refund
//   - PI status 'requires_capture'  → void the authorisation (cancel the PI)
//   - PI any other status           → nothing owed, just cancel the ride in DB
//
// Required secrets: STRIPE_SECRET_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // @ts-ignore — Deno-compatible fetch client
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
    // ── Auth ──────────────────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { ride_id } = body;
    if (!ride_id) return json({ error: 'ride_id required' }, 400);

    // ── Load ride ─────────────────────────────────────────────
    const { data: ride, error: rideErr } = await supabase
      .from('rides')
      .select('id, passenger_id, driver_id, payment_method, payment_status, stripe_payment_intent_id, status')
      .eq('id', ride_id)
      .single();

    if (rideErr || !ride) {
      console.error('[stripe-refund] ride lookup failed', rideErr);
      return json({ error: 'Ride not found' }, 404);
    }
    if (ride.passenger_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (ride.status === 'cancelled') return json({ error: 'Ride already cancelled' }, 409);

    // ── Non-card rides: just cancel in DB ─────────────────────
    if (ride.payment_method !== 'card' || !ride.stripe_payment_intent_id) {
      const { error: dbErr } = await supabase
        .from('rides')
        .update({ status: 'cancelled' })
        .eq('id', ride_id);
      if (dbErr) {
        console.error('[stripe-refund] cancel update failed', dbErr);
        return json({ error: 'Could not cancel ride' }, 500);
      }
      return json({ cancelled: true, refunded: false });
    }

    // ── Idempotency guard ─────────────────────────────────────
    if (ride.payment_status === 'refunded') {
      return json({ cancelled: true, refunded: true, note: 'already refunded' });
    }

    // ── Retrieve the PaymentIntent ────────────────────────────
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(ride.stripe_payment_intent_id);
    } catch (stripeErr: any) {
      console.error('[stripe-refund] PI retrieve failed', stripeErr.message);
      return json({ error: `Stripe error: ${stripeErr.message}` }, 502);
    }

    console.log(`[stripe-refund] PI ${pi.id} status=${pi.status}`);

    // ── Branch on PI status ───────────────────────────────────
    let refundIssued = false;

    if (pi.status === 'succeeded') {
      // Money was captured — issue a full refund
      await stripe.refunds.create({
        payment_intent: pi.id,
        reason: 'requested_by_customer',
      });
      refundIssued = true;

    } else if (pi.status === 'requires_capture') {
      // Money was authorized but never captured — void the hold
      await stripe.paymentIntents.cancel(pi.id);
      refundIssued = true; // cardholder's hold is released

    } else {
      // PI is canceled, payment_failed, processing, etc. — no money was taken
      console.log(`[stripe-refund] PI ${pi.id} in state ${pi.status}, no Stripe action needed`);
    }

    // ── Single DB update: cancel ride + set payment status ────
    const { error: dbErr } = await supabase
      .from('rides')
      .update({
        status: 'cancelled',
        payment_status: refundIssued ? 'refunded' : ride.payment_status,
      })
      .eq('id', ride_id);

    if (dbErr) {
      console.error('[stripe-refund] final DB update failed', dbErr);
      // Stripe refund already issued — return success anyway so the client
      // doesn't retry and double-refund.
      return json({ cancelled: false, refunded: refundIssued, error: 'DB update failed' }, 500);
    }

    // Notify the driver that their assigned ride was cancelled
    if (ride.driver_id ?? null) {
      const { data: driverProfile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', ride.driver_id)
        .single();
      const token = (driverProfile as any)?.push_token;
      if (token?.startsWith('ExponentPushToken[')) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ to: token, title: 'Ride cancelled', body: 'The passenger has cancelled their ride.' + (refundIssued ? ' A refund has been issued.' : '') }]),
        }).catch(() => {});
      }
    }

    return json({ cancelled: true, refunded: refundIssued });

  } catch (err: any) {
    console.error('[stripe-refund] unhandled error', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
