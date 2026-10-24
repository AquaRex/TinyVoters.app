// Tiny Agents phone alerts. Called by the database (tinyagents.push, via pg_net) with the office's push
// subscriptions; sends one Web Push notification to each and forgets the ones the push service says are gone.
// Deploy: supabase functions deploy tiny-push --no-verify-jwt   (setup: docs/CLAUDE_INTEGRATION.md → Phone alerts)
import webpush from 'npm:web-push@3.6.7';

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const SECRET = Deno.env.get('TINY_PUSH_SECRET') ?? '';
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? '',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-tiny-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const { title, body, tag, subs } = (await req.json()) as { title: string; body: string; tag: string; subs: Sub[] };
  const payload = JSON.stringify({ title, body, tag });
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 900,
          urgency: 'high',
          topic: tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone.push(s.endpoint);
        } else {
          console.warn('push failed', status, (e as Error).message);
        }
      }
    }),
  );
  if (gone.length) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/tiny_push_gone`, {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: SECRET, p_endpoints: gone }),
    });
  }
  return Response.json({ sent: subs.length - gone.length, gone: gone.length });
});
