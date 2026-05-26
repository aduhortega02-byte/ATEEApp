// Edge Function: stripe-webhook
// Receives Stripe webhook events and updates the DB accordingly.
// Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events to listen: payment_intent.succeeded, payment_intent.payment_failed,
//                     account.updated

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // @ts-ignore
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { ride_id, booking_id } = pi.metadata ?? {};

        if (ride_id) {
          await supabase
            .from('rides')
            .update({ payment_status: 'paid' })
            .eq('id', ride_id);

          // Notify the driver that card payment cleared
          const { data: ride } = await supabase
            .from('rides')
            .select('driver_id, profiles!rides_driver_id_fkey(push_token)')
            .eq('id', ride_id)
            .single();
          const token = (ride as any)?.profiles?.push_token;
          if (token?.startsWith('ExponentPushToken[')) {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([{ to: token, title: 'Payment received', body: 'The passenger\'s card payment has been confirmed.' }]),
            });
          }
        }
        if (booking_id) {
          // Marketplace bookings don't have a payment_status column — no action needed
          // (booking status 'confirmed' already set at insert time)
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { ride_id } = pi.metadata ?? {};

        if (ride_id) {
          // Cancel the ride if payment failed
          await supabase
            .from('rides')
            .update({ status: 'cancelled', payment_status: 'disputed' })
            .eq('id', ride_id)
            .in('status', ['matching', 'requested']);
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const supabaseUserId = account.metadata?.supabase_user_id;
        if (!supabaseUserId) break;

        const enabled = account.charges_enabled && account.payouts_enabled;
        await supabase
          .from('profiles')
          .update({
            stripe_account_id: account.id,
            stripe_connect_enabled: enabled,
          })
          .eq('id', supabaseUserId);
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err: any) {
    console.error('[stripe-webhook] handler error', err.message);
    // Return 200 anyway so Stripe doesn't retry — log and investigate separately
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
