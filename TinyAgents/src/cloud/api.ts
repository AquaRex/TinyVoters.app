import { AgentInfo } from '../agents/agent';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const TOKEN_KEY = 'tiny-agents.device.v1';

export interface ChatEntry {
  id: number;
  at: string;
  role: 'user' | 'assistant' | 'tool' | 'note';
  text: string;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new CloudError(body.message ?? `${name} failed (${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** This device's token for its office, remembered for as long as the browser keeps site data. */
export function deviceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // storage unavailable: paired for this visit only
  }
  if (token && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => undefined);
  }
}

/** Creates a new office; this device becomes its first viewer. Returns the computers' key. */
export async function createHome(): Promise<string> {
  const r = await rpc<{ ingestKey: string; token: string }>('tiny_create_home');
  saveToken(r.token);
  return r.ingestKey;
}

export async function claimCode(code: string): Promise<void> {
  saveToken(await rpc<string>('tiny_pair_claim', { p_code: code }));
}

export function pairCode(): Promise<string> {
  return rpc<string>('tiny_pair_start', { p_token: deviceToken() });
}

export async function ingestKey(): Promise<string> {
  return (await rpc<{ ingestKey: string }>('tiny_install_info', { p_token: deviceToken() })).ingestKey;
}

export async function forgetDevice(): Promise<void> {
  const token = deviceToken();
  saveToken(null);
  if (token) {
    await rpc('tiny_forget_device', { p_token: token }).catch(() => undefined);
  }
}

export function snapshot(): Promise<AgentInfo[]> {
  return rpc<AgentInfo[]>('tiny_snapshot', { p_token: deviceToken() });
}

export function messages(agentId: string, after = 0): Promise<ChatEntry[]> {
  return rpc<ChatEntry[]>('tiny_messages', { p_token: deviceToken(), p_agent: agentId, p_after: after });
}

export type OfficeStatus = 'unpaired' | 'connecting' | 'online' | 'offline';

/**
 * Polls the office every couple of seconds while the page is visible. Unpaired devices get no Claude
 * agents (demo staff only). A device whose token was revoked is unpaired again.
 */
export function watchOffice(onAgents: (agents: AgentInfo[]) => void, onStatus: (s: OfficeStatus) => void): () => void {
  let timer = 0;
  let stopped = false;
  const tick = async () => {
    if (stopped) {
      return;
    }
    if (!deviceToken()) {
      onStatus('unpaired');
      onAgents([]);
    } else if (document.visibilityState === 'visible') {
      try {
        onAgents(await snapshot());
        onStatus('online');
      } catch (e) {
        if (e instanceof CloudError && e.message === 'not paired') {
          saveToken(null);
          onStatus('unpaired');
          onAgents([]);
        } else {
          onStatus('offline');
        }
      }
    }
    timer = window.setTimeout(tick, 2000);
  };
  onStatus(deviceToken() ? 'connecting' : 'unpaired');
  tick();
  const wake = () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(timer);
      tick();
    }
  };
  document.addEventListener('visibilitychange', wake);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
  };
}

/** The Claude Code hook command a computer runs for every event (async, never blocks Claude). */
export function hookCommand(key: string, machine: string, os: 'windows' | 'mac'): string {
  const curl = os === 'windows' ? 'curl.exe' : 'curl';
  const safeMachine = machine.replace(/[^\w .-]/g, '').slice(0, 40) || 'computer';
  return `${curl} -s -m 10 -X POST "${SUPABASE_URL}/rest/v1/rpc/tiny_ingest" -H "apikey: ${SUPABASE_ANON_KEY}" -H "Content-Type: application/json" -H "x-tiny-key: ${key}" -H "x-tiny-machine: ${safeMachine}" --data-binary @-`;
}

export const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'Notification',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'CwdChanged',
];

/** The settings.json "hooks" block for one computer. */
export function hooksJson(key: string, machine: string, os: 'windows' | 'mac'): string {
  const entry = [{ hooks: [{ type: 'command', command: hookCommand(key, machine, os), async: true, timeout: 15 }] }];
  return JSON.stringify({ hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, entry])) }, null, 2);
}

/** A prompt to paste into Claude Code on the computer: Claude installs its own hooks. */
export function installPrompt(key: string, machine: string, os: 'windows' | 'mac'): string {
  const cmd = hookCommand(key, machine, os);
  return [
    'Please connect this computer to my Tiny Agents office by adding hooks to my USER settings file (~/.claude/settings.json; create it if missing).',
    `For each of these events: ${HOOK_EVENTS.join(', ')}, append this entry to that event's list (keep every existing hook untouched, and replace any earlier entry whose command contains "tiny_ingest"):`,
    JSON.stringify({ hooks: [{ type: 'command', command: cmd, async: true, timeout: 15 }] }),
    'Then show me the events you added. Do not change anything else.',
  ].join('\n\n');
}
