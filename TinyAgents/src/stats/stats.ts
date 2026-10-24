import type { Agent, AgentInfo } from '../agents/agent';
import { demoIdentity } from '../agents/demo';
import { nameFor } from '../agents/people';
import { Career, DayStats, OfficeStats, deviceToken, officeStats } from '../cloud/api';
import { today } from '../world/calendar';

/**
 * Office statistics. Paired devices poll the backend (`officeStats()`); demo staff are counted by a local
 * tracker kept in localStorage (the cloud never sees them). `latestStats()` is the cloud's numbers when paired,
 * otherwise the local tracker's, in the same `OfficeStats` shape.
 */

export interface StatsState {
  stats: OfficeStats | null;
  /** the cloud request failed (e.g. backend SQL not deployed yet) */
  error: string | null;
  source: 'cloud' | 'local';
}

interface LocalCareer extends Career {
  tools: Record<string, number>;
}

interface LocalDay extends DayStats {
  /** career key -> tool calls, for the busiest staff member */
  staff: Record<string, number>;
  fileKeys: string[];
}

interface LocalStore {
  days: Record<string, LocalDay>;
  careers: Record<string, LocalCareer>;
  lifetimeTurns: number;
}

const STORAGE_KEY = 'tiny-agents.stats.v1';
const POLL_MS = 30000;
const DEMO_MACHINE = 'demo';

function load(): LocalStore {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (s?.days && s.careers) {
      return s;
    }
  } catch {
    // corrupt or unavailable storage: start over
  }
  return { days: {}, careers: {}, lifetimeTurns: 0 };
}

const store = load();
let dirty = false;
let cloud: OfficeStats | null = null;
let cloudError: string | null = null;
const listeners = new Set<(s: StatsState) => void>();
/** agent id -> wall-clock ms the session started (for the longest session) */
const started = new Map<string, number>();

export function dayKey(d: Date = today()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyDay(day: string): LocalDay {
  return { day, sessions: 0, prompts: 0, toolCalls: 0, files: 0, errors: 0, turns: 0, longestMin: 0, tools: {}, staff: {}, fileKeys: [] };
}

/** Career identity for an agent: demo staff by their seat, Claude staff by computer + project. */
export function careerOf(a: Agent): { machine: string; project: string } {
  return a.demo ? { machine: DEMO_MACHINE, project: a.slot } : { machine: a.info.machine ?? '', project: a.info.project };
}

/** The people.ts slot a career's person lives in (for names and looks). */
export function careerSlot(c: { machine: string; project: string }): string {
  return c.machine === DEMO_MACHINE ? c.project : `staff:${c.machine}|${c.project}`;
}

/** Display name and workplace of a career's person. */
export function careerName(c: { machine: string; project: string }): string {
  return nameFor(careerSlot(c), c.machine === DEMO_MACHINE ? demoIdentity(`demo:${c.project.slice('demo#'.length)}`)?.name : undefined);
}

export function careerPlace(c: { machine: string; project: string }): string {
  return c.machine === DEMO_MACHINE ? 'demo staff' : c.project;
}

function keyOf(c: { machine: string; project: string }): string {
  return `${c.machine}|${c.project}`;
}

function topTool(tools: Record<string, number>): string | undefined {
  return Object.entries(tools).sort((p, q) => q[1] - p[1])[0]?.[0];
}

function toDay(d: LocalDay): DayStats {
  const [best, toolCalls] = Object.entries(d.staff).sort((p, q) => q[1] - p[1])[0] ?? [];
  const sep = best?.indexOf('|') ?? -1;
  return {
    day: d.day,
    sessions: d.sessions,
    prompts: d.prompts,
    toolCalls: d.toolCalls,
    files: d.files,
    errors: d.errors,
    turns: d.turns,
    longestMin: d.longestMin,
    tools: d.tools,
    busiest: best ? { machine: best.slice(0, sep), project: best.slice(sep + 1), toolCalls } : undefined,
  };
}

function localStats(): OfficeStats {
  const key = dayKey();
  const history = Object.keys(store.days)
    .filter((d) => d < key)
    .sort()
    .reverse()
    .slice(0, 14)
    .map((d) => toDay(store.days[d]));
  return {
    today: toDay(store.days[key] ?? emptyDay(key)),
    history,
    lifetimeTurns: store.lifetimeTurns,
    careers: Object.values(store.careers).map(({ tools, ...c }) => ({ ...c, topTool: topTool(tools) })),
  };
}

function paired(): boolean {
  return !!deviceToken();
}

export function statsState(): StatsState {
  if (paired()) {
    return { stats: cloud, error: cloudError, source: 'cloud' };
  }
  return { stats: localStats(), error: null, source: 'local' };
}

/** The office's numbers: the cloud's when paired (null until loaded or after an error), else the local tracker's. */
export function latestStats(): OfficeStats | null {
  return statsState().stats;
}

/** A staff member's career: Claude staff from the cloud, demo staff from the local tracker. */
export function careerFor(a: Agent): Career | undefined {
  const c = careerOf(a);
  if (a.demo) {
    const local = store.careers[keyOf(c)];
    return local && { ...local, topTool: topTool(local.tools) };
  }
  return cloud?.careers.find((x) => x.machine === c.machine && x.project === c.project);
}

/** Employee of the month leaderboard: staff seen this month, most finished turns first. */
export function monthLeaders(stats: OfficeStats | null, n = 5): Career[] {
  const month = dayKey().slice(0, 7);
  return (stats?.careers ?? [])
    .filter((c) => c.lastSeen.startsWith(month) && c.turns > 0)
    .sort((p, q) => q.turns - p.turns || q.toolCalls - p.toolCalls)
    .slice(0, n);
}

export function sameCareer(a: Agent, c: Career): boolean {
  const k = careerOf(a);
  return k.machine === c.machine && k.project === c.project;
}

/** Calls `fn` now and whenever the numbers change. Returns an unsubscribe function. */
export function onStats(fn: (s: StatsState) => void): () => void {
  listeners.add(fn);
  fn(statsState());
  return () => listeners.delete(fn);
}

function emit(): void {
  const s = statsState();
  listeners.forEach((fn) => fn(s));
}

/** Fetches the cloud numbers now (the report calls this when it opens). */
export async function refreshStats(): Promise<void> {
  if (!paired()) {
    emit();
    return;
  }
  try {
    cloud = await officeStats();
    cloudError = null;
  } catch (e) {
    cloudError = e instanceof Error ? e.message : String(e);
  }
  emit();
}

function poll(): void {
  if (document.visibilityState === 'visible') {
    refreshStats();
  }
  window.setTimeout(poll, POLL_MS);
}
poll();

// ---------------------------------------------------------------- local tracker (demo staff)

function day(): LocalDay {
  const key = dayKey();
  return (store.days[key] ??= emptyDay(key));
}

function career(a: Agent): LocalCareer {
  const c = careerOf(a);
  const d = dayKey();
  const k = keyOf(c);
  const rec = (store.careers[k] ??= { ...c, daysWorked: 0, sessions: 0, prompts: 0, toolCalls: 0, turns: 0, firstSeen: d, lastSeen: '', tools: {} });
  if (rec.lastSeen !== d) {
    rec.lastSeen = d;
    rec.daysWorked++;
  }
  return rec;
}

function tracked(a: Agent): boolean {
  return a.demo && !a.npc;
}

export function trackSpawn(a: Agent): void {
  if (!tracked(a)) {
    return;
  }
  started.set(a.id, Date.now());
  day().sessions++;
  career(a).sessions++;
  dirty = true;
}

export function trackInfo(a: Agent, was: AgentInfo, now: AgentInfo): void {
  if (!tracked(a) || was === now) {
    return;
  }
  const d = day();
  const c = career(a);
  if (now.busy && !was.busy) {
    d.prompts++;
    c.prompts++;
    dirty = true;
  }
  if (!now.busy && was.busy) {
    d.turns++;
    c.turns++;
    store.lifetimeTurns++;
    dirty = true;
  }
  const newCall = now.busy && now.tool && (now.tool !== was.tool || now.detail !== was.detail || !was.busy);
  if (newCall && now.tool) {
    const t = now.tool;
    d.toolCalls++;
    c.toolCalls++;
    d.tools[t] = (d.tools[t] ?? 0) + 1;
    c.tools[t] = (c.tools[t] ?? 0) + 1;
    const k = keyOf(careerOf(a));
    d.staff[k] = (d.staff[k] ?? 0) + 1;
    if (t === 'Edit' || t === 'Write' || t === 'MultiEdit') {
      const file = now.detail ? `${a.info.project}/${now.detail}` : `${a.id}#${d.toolCalls}`;
      if (!d.fileKeys.includes(file)) {
        d.fileKeys.push(file);
        d.files = d.fileKeys.length;
      }
    }
    dirty = true;
  }
  if (now.state === 'error' && was.state !== 'error') {
    d.errors++;
    dirty = true;
  }
}

export function trackGone(a: Agent): void {
  const t = started.get(a.id);
  if (t === undefined) {
    return;
  }
  started.delete(a.id);
  const d = day();
  d.longestMin = Math.max(d.longestMin, Math.round((Date.now() - t) / 60000));
  dirty = true;
}

/** Writes the local tracker to storage when it changed (called every few seconds). */
export function flushStats(): void {
  if (!dirty) {
    return;
  }
  dirty = false;
  const now = Date.now();
  const d = day();
  for (const t of started.values()) {
    d.longestMin = Math.max(d.longestMin, Math.round((now - t) / 60000));
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable: numbers last for this visit
  }
  if (!paired()) {
    emit();
  }
}
