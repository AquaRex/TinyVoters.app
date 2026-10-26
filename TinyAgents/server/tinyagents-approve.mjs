// Tiny Agents away mode: a Claude Code PermissionRequest hook (Node 18+). Installed as ~/.claude/tinyagents-approve.mjs.
//   node ~/.claude/tinyagents-approve.mjs <computer key> <hub url>
// With away mode off (the default) it exits at once with no output, so Claude Code shows its normal prompt.
// With it on, it waits (up to 10 minutes) for a paired device to approve or deny, then prints that decision.
// Offline, or any error: no output, so the normal prompt appears.
const key = process.argv[2] ?? '';
const hub = process.argv[3] ?? '';
const until = Date.now() + 10 * 60 * 1000;

async function wait(request, event) {
  const res = await fetch(`${hub}/rpc/tiny_approval_wait`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tiny-key': key },
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
