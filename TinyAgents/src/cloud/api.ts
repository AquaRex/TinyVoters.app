import { AgentInfo } from '../agents/agent';
import type { Person } from '../agents/people';
import { hubUrl } from './config';
import approveScript from '../../server/tinyagents-approve.mjs?raw';

const TOKEN_KEY = 'tiny-agents.device.v1';

/** Set when the page was opened with ?visit=<token>: a read-only view of someone's office (states only). */
export const visitToken: string | null = new URLSearchParams(location.search).get('visit');

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
  const res = await fetch(`${hubUrl()}/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

// ---------------------------------------------------------------- customized people (shared by every device of the office)

/** Name and look per person slot, as the editor in the agent panel saved them. */
export function people(): Promise<Record<string, Person>> {
  return rpc<Record<string, Person>>('tiny_people', { p_token: deviceToken() });
}

export function savePersonRemote(slot: string, person: Person): Promise<void> {
  return rpc<void>('tiny_save_person', { p_token: deviceToken(), p_slot: slot, p_person: person });
}

export function forgetPersonRemote(slot: string): Promise<void> {
  return rpc<void>('tiny_forget_person', { p_token: deviceToken(), p_slot: slot });
}

// ---------------------------------------------------------------- custom names (team and room names, shared by every device)

/** Custom names by key (`team:<machine>|<project>`, `room:<floor id>:<room id>`). */
export function labels(): Promise<Record<string, string>> {
  return rpc<Record<string, string>>('tiny_labels', { p_token: deviceToken() });
}

export function saveLabelRemote(key: string, name: string): Promise<void> {
  return rpc<void>('tiny_save_label', { p_token: deviceToken(), p_key: key, p_name: name });
}

export function forgetLabelRemote(key: string): Promise<void> {
  return rpc<void>('tiny_forget_label', { p_token: deviceToken(), p_key: key });
}

// ---------------------------------------------------------------- stats and careers

export interface DayStats {
  /** local day, YYYY-MM-DD */
  day: string;
  sessions: number;
  prompts: number;
  toolCalls: number;
  /** distinct files edited or written */
  files: number;
  errors: number;
  /** finished turns (Stop) */
  turns: number;
  /** longest single session that day, minutes */
  longestMin: number;
  /** tool name -> calls */
  tools: Record<string, number>;
  /** the staff member (machine + project) with the most tool calls */
  busiest?: { machine: string; project: string; toolCalls: number };
}

/** A recurring staff member: one per computer + project folder. */
export interface Career {
  machine: string;
  project: string;
  daysWorked: number;
  sessions: number;
  prompts: number;
  toolCalls: number;
  turns: number;
  topTool?: string;
  firstSeen: string;
  lastSeen: string;
}

export interface OfficeStats {
  today: DayStats;
  /** previous days, newest first (up to 14) */
  history: DayStats[];
  lifetimeTurns: number;
  careers: Career[];
}

/** `tzOffsetMin` is the device's offset from UTC in minutes (east positive), so "today" is the viewer's day. */
export function officeStats(): Promise<OfficeStats> {
  return rpc<OfficeStats>('tiny_stats', { p_token: deviceToken(), p_tz_offset: -new Date().getTimezoneOffset() });
}

// ---------------------------------------------------------------- history (day replay)

/** One state change of one agent; `state: 'ended'` means the session or subagent left. */
export interface HistoryEvent {
  at: string;
  id: string;
  kind: 'main' | 'sub';
  type: string;
  parent?: string;
  machine?: string;
  project?: string;
  state: AgentInfo['state'] | 'ended';
  tool?: string;
  detail?: string;
}

export function history(sinceIso: string): Promise<HistoryEvent[]> {
  return rpc<HistoryEvent[]>('tiny_history', { p_token: deviceToken(), p_since: sinceIso });
}

// ---------------------------------------------------------------- visitor links (read-only, no details)

/** Creates (or returns the existing) visitor token for this office. */
export function visitorLink(): Promise<string> {
  return rpc<string>('tiny_visitor_link', { p_token: deviceToken() });
}

export function revokeVisitorLink(): Promise<void> {
  return rpc<void>('tiny_visitor_revoke', { p_token: deviceToken() });
}

/** States only: id, kind, type, parent, busy, waiting, state. No tools, details, titles, projects or chat. */
export function visitorSnapshot(visitor: string): Promise<AgentInfo[]> {
  return rpc<AgentInfo[]>('tiny_visitor_snapshot', { p_visitor: visitor });
}

// ---------------------------------------------------------------- remote approvals (opt-in "away mode")

export interface ApprovalRequest {
  id: string;
  agentId: string;
  tool: string;
  detail?: string;
  at: string;
}

export function awayInfo(): Promise<{ away: boolean }> {
  return rpc<{ away: boolean }>('tiny_away_info', { p_token: deviceToken() });
}

export function setAway(on: boolean): Promise<void> {
  return rpc<void>('tiny_set_away', { p_token: deviceToken(), p_on: on });
}

export function pendingApprovals(): Promise<ApprovalRequest[]> {
  return rpc<ApprovalRequest[]>('tiny_pending_approvals', { p_token: deviceToken() });
}

export function decideApproval(id: string, allow: boolean): Promise<void> {
  return rpc<void>('tiny_decide', { p_token: deviceToken(), p_request: id, p_allow: allow });
}

export type OfficeStatus = 'unpaired' | 'connecting' | 'online' | 'offline';

/**
 * Streams the office from the hub (it sends every change). Unpaired devices get no Claude agents (demo staff
 * only); pairing or forgetting this device is picked up within a couple of seconds. A device whose token was
 * revoked is unpaired again. Visitors (?visit=) get the states-only visitor stream instead.
 */
export function watchOffice(onAgents: (agents: AgentInfo[]) => void, onStatus: (s: OfficeStatus) => void): () => void {
  let source: EventSource | null = null;
  /** the token the stream was opened with; undefined until the first check, or to reopen a closed stream */
  let streamToken: string | null | undefined;
  const close = () => {
    source?.close();
    source = null;
  };
  const open = (token: string) => {
    streamToken = token;
    onStatus('connecting');
    const query = visitToken ? `visit=${encodeURIComponent(visitToken)}` : `token=${encodeURIComponent(token)}`;
    const stream = new EventSource(`${hubUrl()}/events?${query}`);
    source = stream;
    stream.addEventListener('agents', (e) => {
      onAgents(JSON.parse((e as MessageEvent<string>).data) as AgentInfo[]);
      onStatus('online');
    });
    stream.onerror = async () => {
      onStatus('offline');
      if (stream.readyState === EventSource.CLOSED) {
        close();
        streamToken = undefined;
      }
      if (visitToken) {
        return;
      }
      try {
        await snapshot();
      } catch (e) {
        if (e instanceof CloudError && e.message === 'not paired' && deviceToken() === token) {
          saveToken(null);
          close();
          streamToken = null;
          onStatus('unpaired');
          onAgents([]);
        }
      }
    };
  };
  const check = () => {
    const token = visitToken ?? deviceToken();
    if (token === streamToken) {
      return;
    }
    close();
    if (token) {
      open(token);
    } else {
      streamToken = null;
      onStatus('unpaired');
      onAgents([]);
    }
  };
  check();
  const timer = window.setInterval(check, 2000);
  return () => {
    clearInterval(timer);
    close();
  };
}

/** The Claude Code hook command a computer runs for every event (async, never blocks Claude). */
export function hookCommand(key: string, machine: string, os: 'windows' | 'mac'): string {
  const curl = os === 'windows' ? 'curl.exe' : 'curl';
  const safeMachine = machine.replace(/[^\w .-]/g, '').slice(0, 40) || 'computer';
  return `${curl} -s -m 10 -X POST "${hubUrl()}/ingest" -H "Content-Type: application/json" -H "x-tiny-key: ${key}" -H "x-tiny-machine: ${safeMachine}" --data-binary @-`;
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
    `For each of these events: ${HOOK_EVENTS.join(', ')}, append this entry to that event's list (keep every existing hook untouched, and replace any earlier entry whose command contains "tiny_ingest" or "/ingest"):`,
    JSON.stringify({ hooks: [{ type: 'command', command: cmd, async: true, timeout: 15 }] }),
    'Then show me the events you added. Do not change anything else.',
  ].join('\n\n');
}

/**
 * A prompt to paste into Claude Code on a computer: adds the away-mode approvals hook (a PermissionRequest
 * hook that waits for a paired device's decision while away mode is on, and does nothing otherwise).
 */
export function approvalsPrompt(key: string): string {
  return [
    'Please add Tiny Agents away-mode approvals to this computer. It needs Node.js 18 or newer (check with `node --version`).',
    '1. Create the file ~/.claude/tinyagents-approve.mjs with exactly this content:',
    '```js\n' + approveScript.trim() + '\n```',
    '2. In my USER settings file (~/.claude/settings.json), append this entry to the "PermissionRequest" hooks list (keep every existing hook untouched, and replace any earlier entry whose command contains "tinyagents-approve"). Use the absolute path of that file with forward slashes in place of <PATH>:',
    JSON.stringify({ hooks: [{ type: 'command', command: `node "<PATH>" ${key} ${hubUrl()}`, timeout: 660 }] }),
    'Then show me what you changed. Do not change anything else.',
  ].join('\n\n');
}
