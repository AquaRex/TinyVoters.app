// Tiny Agents away mode: a Claude Code PermissionRequest hook (Node 18+). Installed as ~/.claude/tinyagents-approve.mjs.
//   node ~/.claude/tinyagents-approve.mjs <computer key>
// With away mode off (the default) it exits at once with no output, so Claude Code shows its normal prompt.
// With it on, it waits (up to 10 minutes) for a paired device to approve or deny, then prints that decision.
// Offline, or any error: no output, so the normal prompt appears.
const SUPABASE_URL = 'https://hchyekrxubzuqrnlckpm.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
const key = process.argv[2] ?? '';
const until = Date.now() + 10 * 60 * 1000;

async function wait(request, event) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tiny_approval_wait`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json', 'x-tiny-key': key },
    body: JSON.stringify({ p_request: request, p_event: event }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`tiny_approval_wait ${res.status}`);
  }
  return res.json();
}

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  let r = await wait(null, JSON.parse(input));
  while (r.state === 'pending' && Date.now() < until) {
    await new Promise((done) => setTimeout(done, 2000));
    r = await wait(r.id, null).catch(() => r);
  }
  if (r.state === 'allow' || r.state === 'deny') {
    const decision = r.state === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied from the Tiny Agents office.' };
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }));
  }
} catch {
  // no decision: Claude Code asks as usual
}
