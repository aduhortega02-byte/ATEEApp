// Edge Function: send-push
// Sends Expo push notifications to one or more users.
// Accepts { user_id, title, body } or { user_ids, title, body }.
// Looks up the target user(s) push_token from the profiles table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // Auth — must be a signed-in user or service role
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const { title, body: msgBody } = body;

  if (!title || !msgBody) {
    return json({ error: 'title and body are required' }, 400);
  }

  // Resolve target user IDs
  let userIds: string[] = [];
  if (Array.isArray(body.user_ids) && body.user_ids.length > 0) {
    userIds = body.user_ids;
  } else if (typeof body.user_id === 'string') {
    userIds = [body.user_id];
  } else {
    return json({ error: 'user_id or user_ids required' }, 400);
  }

  // Fetch push tokens
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('push_token')
    .in('id', userIds)
    .not('push_token', 'is', null);

  if (profileErr) {
    console.error('[send-push] profile fetch failed', profileErr);
    return json({ error: 'Could not fetch push tokens' }, 500);
  }

  const tokens: string[] = (profiles ?? [])
    .map((p: { push_token: string | null }) => p.push_token)
    .filter((t): t is string => !!t && t.startsWith('ExponentPushToken['));

  if (tokens.length === 0) {
    return json({ sent: 0, note: 'no valid push tokens found' });
  }

  // Send to Expo push service
  const messages = tokens.map((to) => ({ to, title, body: msgBody, sound: 'default' }));

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!expoRes.ok) {
    const err = await expoRes.text();
    console.error('[send-push] Expo API error', err);
    return json({ error: 'Expo push failed', detail: err }, 502);
  }

  const result = await expoRes.json();
  console.log('[send-push] sent', tokens.length, 'notifications');
  return json({ sent: tokens.length, expo: result });
});

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
