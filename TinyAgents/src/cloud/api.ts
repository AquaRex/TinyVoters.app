import { AgentInfo } from '../agents/agent';
import type { Person } from '../agents/people';
import { LOCAL_HUB, onHubComputer } from './config';
import { Link, LinkError } from './link';
import approveScript from '../../server/tinyagents-approve.mjs?raw';

const TOKEN_KEY = 'tiny-agents.device.v1';
/** On another device, the office code takes the device token's place (kept apart, so the two never mix). */
const CODE_KEY = 'tiny-agents.office-code.v1';
const credentialKey = () => (onHubComputer() ? TOKEN_KEY : CODE_KEY);

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

/** The link to the hub for a device elsewhere (its office code is stored where the device token would be). */
let link: Link | null = null;

function remote(): Link {
  const code = deviceToken()!;
  if (!link || link.code !== code) {
    link?.stop();
    link = new Link(code);
    link.start();
  }
  return link;
}

/** A request through the link, with its failures as CloudErrors. */
async function viaLink<T>(kind: string, name = '', args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await remote().request<T>(kind, name, args);
  } catch (e) {
    throw e instanceof LinkError ? new CloudError(e.message, e.status) : e;
  }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!onHubComputer()) {
    return viaLink<T>('rpc', name, args);
  }
  const res = await fetch(`${LOCAL_HUB}/rpc/${name}`, {
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
    return localStorage.getItem(credentialKey());
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(credentialKey(), token);
    } else {
      localStorage.removeItem(credentialKey());
    }
  } catch {
    // storage unavailable: paired for this visit only
  }
  if (token && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => undefined);
  }
}

/** On the hub's computer: this browser gets its own device token. */
export async function joinOffice(): Promise<void> {
  saveToken(await rpc<string>('tiny_join'));
}

/** Elsewhere: connects with the office code (shown on the hub's computer), once the hub answers through it. */
export async function connectWithCode(code: string): Promise<void> {
  const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const trial = new Link(clean);
  trial.start();
  try {
    await trial.request('status');
  } catch (e) {
    trial.stop();
    throw e instanceof LinkError && e.status === 504 ? new CloudError('No PC answered with that code: check the code, and that the PC is on with the hub running.', 504) : e;
  }
  link?.stop();
  link = trial;
  saveToken(clean);
}

/** The office code devices elsewhere connect with (asked on the hub's computer). */
export function officeCode(): Promise<string> {
  return rpc<string>('tiny_office_code', { p_token: deviceToken() });
}

/** A new office code: every device elsewhere is disconnected until it gets the new one. */
export function newOfficeCode(): Promise<string> {
  return rpc<string>('tiny_new_code', { p_token: deviceToken() });
}

/** How the link to the hub is going for a device elsewhere (null on the hub's computer). */
export function linkState(): string | null {
  return onHubComputer() ? null : (link?.state ?? 'connecting');
}

/** The minds' state on the hub. */
export async function mindStatus(): Promise<{ state: string; note: string }> {
  if (!onHubComputer()) {
    return viaLink('status');
  }
  return (await fetch(`${LOCAL_HUB}/mind/status`)).json();
}

/** One answer from the minds' model, or a CloudError (status 503 when the minds aren't available right now). */
export async function mindAsk(body: Record<string, unknown>): Promise<{ raw: string }> {
  if (!onHubComputer()) {
    return viaLink('mind', '', body);
  }
  const res = await fetch(`${LOCAL_HUB}/mind`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, token: deviceToken() }) });
  if (!res.ok) {
    throw new CloudError(`mind ${res.status}`, res.status);
  }
  return res.json();
}

export async function ingestKey(): Promise<string> {
  return (await rpc<{ ingestKey: string }>('tiny_install_info', { p_token: deviceToken() })).ingestKey;
}

export async function forgetDevice(): Promise<void> {
  const token = deviceToken();
  saveToken(null);
  if (!onHubComputer()) {
    link?.stop();
    link = null;
    return;
  }
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
    if (!onHubComputer() && !visitToken) {
      const l = remote();
      const refresh = () => viaLink<AgentInfo[]>('rpc', 'tiny_snapshot').then((agents) => {
        onAgents(agents);
        onStatus('online');
      }, () => onStatus('offline'));
      l.onPush((kind, data) => {
        if (kind === 'agents' && l === link) {
          onAgents(data as AgentInfo[]);
          onStatus('online');
        }
      });
      l.onState((s) => l === link && (s === 'offline' ? onStatus('offline') : void refresh()));
      void refresh();
      return;
    }
    const query = visitToken ? `visit=${encodeURIComponent(visitToken)}` : `token=${encodeURIComponent(token)}`;
    const stream = new EventSource(`${LOCAL_HUB}/events?${query}`);
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
          joinOffice().catch(() => undefined);
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
    JSON.stringify({ hooks: [{ type: 'command', command: `node "<PATH>" ${key} ${LOCAL_HUB}`, timeout: 660 }] }),
    'Then show me what you changed. Do not change anything else.',
  ].join('\n\n');
}
