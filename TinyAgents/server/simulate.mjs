// Fakes a few Claude Code sessions (with subagents) by posting hook events to your office.
// Handy for watching the office without running real agents. Ctrl+C ends all fake sessions.
//   npm run simulate -- <computer key> [sessions]
const SUPABASE_URL = 'https://hchyekrxubzuqrnlckpm.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
const KEY = process.argv[2];
const SESSIONS = Number(process.argv[3] ?? 3);
if (!/^[0-9a-f]{64}$/.test(KEY ?? '')) {
  console.error('Usage: npm run simulate -- <computer key> [sessions]');
  process.exit(1);
}

const PROJECTS = ['tiny-agents', 'pixel-shop', 'api-gateway', 'docs-site', 'ml-pipeline', 'mobile-app'];
const SUBAGENTS = ['Explore', 'Plan', 'general-purpose', 'ui-designer', 'backend-dev', 'test-runner', 'code-reviewer', 'docs-writer', 'devops-engineer', 'security-auditor', 'data-analyst', 'frontend-dev'];
const FILES = ['src/main.ts', 'src/app.tsx', 'server/index.js', 'README.md', 'src/api/users.ts', 'tests/auth.test.ts', 'package.json'];
const CALLS = [
  ['Read', () => ({ file_path: pick(FILES) })],
  ['Read', () => ({ file_path: pick(FILES) })],
  ['Edit', () => ({ file_path: pick(FILES) })],
  ['Edit', () => ({ file_path: pick(FILES) })],
  ['Write', () => ({ file_path: pick(FILES) })],
  ['Bash', () => ({ command: pick(['npm test', 'npm run build', 'git status', 'ls -la']), description: pick(['Run tests', 'Build the app', undefined]) })],
  ['Grep', () => ({ pattern: pick(['TODO', 'useState', 'fetchUser', 'export default']) })],
  ['Glob', () => ({ pattern: pick(['**/*.ts', 'src/**/*.tsx']) })],
  ['WebSearch', () => ({ query: pick(['vite proxy sse', 'canvas pixel art scaling']) })],
  ['WebFetch', () => ({ url: pick(['https://developer.mozilla.org/en-US/docs/Web', 'https://vitejs.dev/config/']) })],
];
const MODELS = ['Opus 5.5', 'Sonnet 5.5'];
const TITLES = ['Fix the login redirect', 'Add dark mode', 'Speed up the build', 'Write API docs', 'Refactor the cart'];
const toolCall = () => {
  const [tool_name, input] = pick(CALLS);
  return { tool_name, tool_input: input() };
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const live = new Set();
let counter = 0;

async function post(evt) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tiny_ingest`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json', 'x-tiny-key': KEY, 'x-tiny-machine': 'Simulator' },
    body: JSON.stringify(evt),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!res.ok) {
    console.error(`Office refused the event (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
}

async function subagent(session, cwd) {
  const agent_id = `agent-${++counter}`;
  const agent_type = pick(SUBAGENTS);
  await post({ hook_event_name: 'PreToolUse', session_id: session, cwd, tool_name: 'Agent', tool_input: { subagent_type: agent_type, description: pick(['Find the auth code', 'Review the diff', 'Plan the refactor', 'Write tests']) } });
  await post({ hook_event_name: 'SubagentStart', session_id: session, cwd, agent_id, agent_type });
  const until = Date.now() + between(25, 90) * 1000;
  while (Date.now() < until) {
    const call = toolCall();
    await post({ hook_event_name: 'PreToolUse', session_id: session, cwd, agent_id, agent_type, ...call });
    await sleep(between(1, 3) * 1000);
    await post({ hook_event_name: 'PostToolUse', session_id: session, cwd, agent_id, agent_type, tool_name: call.tool_name });
    await sleep(between(2, 6) * 1000);
  }
  await post({ hook_event_name: 'SubagentStop', session_id: session, cwd, agent_id, agent_type });
}

async function runSession() {
  const session = `sim-${++counter}-${Math.random().toString(36).slice(2, 7)}`;
  const cwd = `/work/${pick(PROJECTS)}`;
  live.add(session);
  await post({ hook_event_name: 'SessionStart', session_id: session, cwd, source: 'startup', model: pick(MODELS), session_title: pick(TITLES) });
  const rounds = Math.floor(between(3, 8));
  for (let r = 0; r < rounds && live.has(session); r++) {
    await sleep(between(8, 30) * 1000);
    await post({ hook_event_name: 'UserPromptSubmit', session_id: session, cwd, prompt: 'do the thing' });
    const subs = [];
    const workUntil = Date.now() + between(20, 70) * 1000;
    while (Date.now() < workUntil && live.has(session)) {
      const roll = Math.random();
      if (roll < 0.12 && subs.length < 3) {
        subs.push(subagent(session, cwd));
      } else if (roll < 0.17) {
        await post({ hook_event_name: 'PreToolUse', session_id: session, cwd, tool_name: 'Bash', tool_input: { command: 'rm -rf dist', description: 'Clean the build folder' } });
        await post({ hook_event_name: 'PermissionRequest', session_id: session, cwd, tool_name: 'Bash' });
        await post({ hook_event_name: 'Notification', session_id: session, cwd, notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
        await sleep(between(4, 9) * 1000);
        await post({ hook_event_name: 'PostToolUse', session_id: session, cwd, tool_name: 'Bash' });
      } else if (roll < 0.19) {
        await post({ hook_event_name: 'PreCompact', session_id: session, cwd, trigger: 'auto' });
        await sleep(between(4, 8) * 1000);
        await post({ hook_event_name: 'PostCompact', session_id: session, cwd, trigger: 'auto' });
      } else {
        const call = toolCall();
        await post({ hook_event_name: 'PreToolUse', session_id: session, cwd, ...call });
        await sleep(between(1, 3) * 1000);
        await post({ hook_event_name: 'PostToolUse', session_id: session, cwd, tool_name: call.tool_name });
      }
      await sleep(between(2, 5) * 1000);
    }
    await Promise.all(subs);
    if (Math.random() < 0.08) {
      await post({ hook_event_name: 'StopFailure', session_id: session, cwd, error: pick(['rate_limit', 'overloaded']) });
    } else {
      await post({ hook_event_name: 'Stop', session_id: session, cwd, background_tasks: [], session_crons: [] });
    }
  }
  await sleep(between(10, 25) * 1000);
  if (live.delete(session)) {
    await post({ hook_event_name: 'SessionEnd', session_id: session, cwd, reason: 'other' });
  }
}

async function keepAlive(slot) {
  await sleep(slot * 2500);
  for (;;) {
    await runSession();
    await sleep(between(5, 20) * 1000);
  }
}

process.on('SIGINT', async () => {
  for (const session of live) {
    await post({ hook_event_name: 'SessionEnd', session_id: session, reason: 'other' });
  }
  process.exit(0);
});

console.log(`Simulating ${SESSIONS} Claude Code sessions in your office (Ctrl+C to stop)`);
for (let i = 0; i < SESSIONS; i++) {
  keepAlive(i);
}
