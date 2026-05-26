// Edge Function: stripe-connect-onboard
// Creates a Stripe Express Connect account for a driver and returns the onboarding URL.
// Required secrets: STRIPE_SECRET_KEY
// Optional env: STRIPE_CONNECT_RETURN_URL, STRIPE_CONNECT_REFRESH_URL

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const RETURN_URL = Deno.env.get('STRIPE_CONNECT_RETURN_URL') ?? 'https://atee.app/connect/return';
const REFRESH_URL = Deno.env.get('STRIPE_CONNECT_REFRESH_URL') ?? 'https://atee.app/connect/refresh';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // Load existing profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_connect_enabled, full_name')
      .eq('id', user.id)
      .single();

    let stripeAccountId: string = profile?.stripe_account_id ?? '';

    if (!stripeAccountId) {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { supabase_user_id: user.id },
      });
      stripeAccountId = account.id;

      // Save immediately so we don't create duplicates on retry
      await supabase
        .from('profiles')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', user.id);
    }

    // Create a fresh onboarding link (links expire after a few minutes)
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      return_url: RETURN_URL,
      refresh_url: REFRESH_URL,
      type: 'account_onboarding',
    });

    return json({ url: accountLink.url, stripe_account_id: stripeAccountId });
  } catch (err: any) {
    console.error('[stripe-connect-onboard]', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
