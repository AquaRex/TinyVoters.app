// Connects this computer's Claude Code to your Tiny Agents office (or, with --remove, disconnects it).
//   npm run install-hooks -- <computer key> [--name "My PC"]
//   npm run install-hooks -- --remove
// The computer key is under Connect → Add a computer → "Copy settings JSON" (the x-tiny-key value).
// A timestamped backup of ~/.claude/settings.json is written before any change. Other hooks are left alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SUPABASE_URL = 'https://hchyekrxubzuqrnlckpm.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'PermissionDenied', 'Notification', 'Stop', 'StopFailure', 'SubagentStart',
  'SubagentStop', 'PreCompact', 'PostCompact', 'CwdChanged',
];

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const nameAt = args.indexOf('--name');
const machine = (nameAt >= 0 ? args[nameAt + 1] : os.hostname()).replace(/[^\w .-]/g, '').slice(0, 40) || 'computer';
const key = args.find((a, i) => !a.startsWith('--') && (nameAt < 0 || i !== nameAt + 1));
if (!remove && !/^[0-9a-f]{64}$/.test(key ?? '')) {
  console.error('Usage: npm run install-hooks -- <computer key> [--name "My PC"]   (or --remove)');
  process.exit(1);
}

const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const command = `${curl} -s -m 10 -X POST "${SUPABASE_URL}/rest/v1/rpc/tiny_ingest" -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" -H "x-tiny-key: ${key}" -H "x-tiny-machine: ${machine}" --data-binary @-`;
// ours: this cloud hook, or the earlier local-bridge hook (…/server/hook.mjs)
const isOurs = (h) => typeof h.command === 'string' && (h.command.includes('tiny_ingest') || /TinyAgents\/server\/hook\.mjs"?$/.test(h.command));

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
if (fs.existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(settingsPath, backup);
  console.log(`Backed up settings to ${backup}`);
}

settings.hooks ??= {};
for (const event of Object.keys(settings.hooks)) {
  settings.hooks[event] = settings.hooks[event]
    .map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((h) => !isOurs(h)) }))
    .filter((entry) => entry.hooks.length);
  if (!settings.hooks[event].length) {
    delete settings.hooks[event];
  }
}
if (!remove) {
  for (const event of EVENTS) {
    (settings.hooks[event] ??= []).push({ hooks: [{ type: 'command', command, async: true, timeout: 15 }] });
  }
}
if (!Object.keys(settings.hooks).length) {
  delete settings.hooks;
}

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(remove ? 'Removed the Tiny Agents hooks.' : `Connected "${machine}" to your office (${EVENTS.length} events). New Claude Code sessions will show up.`);
