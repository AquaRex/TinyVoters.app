// Connects this computer's Claude Code to your Tiny Agents office (or, with --remove, disconnects it).
//   npm run install-hooks -- <computer key> [--name "My PC"] [--hub http://127.0.0.1:7777] [--approvals]
//   npm run install-hooks -- --remove
// --approvals also installs the away-mode approvals hook (~/.claude/tinyagents-approve.mjs, a PermissionRequest
// hook that lets a paired device approve or deny while away mode is on; see docs/CLAUDE_INTEGRATION.md).
// The computer key is under Connect → Add a computer → "Copy settings JSON" (the x-tiny-key value).
// A timestamped backup of ~/.claude/settings.json is written before any change. Other hooks are left alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'PermissionDenied', 'Notification', 'Stop', 'StopFailure', 'SubagentStart',
  'SubagentStop', 'PreCompact', 'PostCompact', 'CwdChanged',
];

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const approvals = args.includes('--approvals');
const nameAt = args.indexOf('--name');
const hubAt = args.indexOf('--hub');
const machine = (nameAt >= 0 ? args[nameAt + 1] : os.hostname()).replace(/[^\w .-]/g, '').slice(0, 40) || 'computer';
const hub = (hubAt >= 0 ? args[hubAt + 1] : 'http://127.0.0.1:7777').replace(/\/+$/, '');
const key = args.find((a, i) => !a.startsWith('--') && (nameAt < 0 || i !== nameAt + 1) && (hubAt < 0 || i !== hubAt + 1));
if (!remove && !/^[0-9a-f]{64}$/.test(key ?? '')) {
  console.error('Usage: npm run install-hooks -- <computer key> [--name "My PC"] [--hub http://127.0.0.1:7777] [--approvals]   (or --remove)');
  process.exit(1);
}

const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const command = `${curl} -s -m 10 -X POST "${hub}/ingest" -H "Content-Type: application/json" -H "x-tiny-key: ${key}" -H "x-tiny-machine: ${machine}" --data-binary @-`;
// ours: this hub hook, the earlier Supabase hook (tiny_ingest), the approvals hook, or the earlier local-bridge hook (…/server/hook.mjs)
const isOurs = (h) =>
  typeof h.command === 'string' &&
  (h.command.includes('/ingest"') || h.command.includes('tiny_ingest') || h.command.includes('tinyagents-approve') || /TinyAgents\/server\/hook\.mjs"?$/.test(h.command));
const approvePath = path.join(os.homedir(), '.claude', 'tinyagents-approve.mjs');

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
if (approvals && !remove) {
  fs.mkdirSync(path.dirname(approvePath), { recursive: true });
  fs.copyFileSync(fileURLToPath(new URL('./tinyagents-approve.mjs', import.meta.url)), approvePath);
  // waits up to 10 minutes for a decision, so the hook's timeout must be longer than that
  const approveCommand = `node "${approvePath.replace(/\\/g, '/')}" ${key} ${hub}`;
  (settings.hooks.PermissionRequest ??= []).push({ hooks: [{ type: 'command', command: approveCommand, timeout: 660 }] });
} else if (fs.existsSync(approvePath)) {
  fs.rmSync(approvePath);
}
if (!Object.keys(settings.hooks).length) {
  delete settings.hooks;
}

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(remove ? 'Removed the Tiny Agents hooks.' : `Connected "${machine}" to your office (${EVENTS.length} events). New Claude Code sessions will show up.`);
if (approvals && !remove) {
  console.log(`Away-mode approvals installed (${approvePath}). They only act while away mode is on in Connect.`);
}
