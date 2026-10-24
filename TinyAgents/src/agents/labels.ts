import { app } from '../app';
import { deviceToken, forgetLabelRemote, labels, saveLabelRemote } from '../cloud/api';
import type { Agent } from './agent';

/**
 * Custom names for teams (`team:<machine>|<project>`) and rooms (`room:<floor id>:<room id>`). localStorage is the
 * cache; when paired, the office's copy (shared by every device) wins, like customized people.
 */
const STORAGE_KEY = 'tiny-agents.labels.v1';
const SYNC_MS = 30000;
export const MAX_LABEL = 40;

function loadAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

let cache = loadAll();

function storeAll(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable: names last for this session
  }
}

function remote(what: string, call: () => Promise<void>): void {
  if (deviceToken()) {
    call().catch((e) => app.toast(`Couldn't ${what}: ${e instanceof Error ? e.message : e}`));
  }
}

export function labelFor(key: string): string | undefined {
  return cache[key];
}

/** Saves a name; an empty name goes back to the default. */
export function saveLabel(key: string, name: string): void {
  const clean = name.trim().slice(0, MAX_LABEL);
  if (!clean) {
    delete cache[key];
    storeAll();
    remote('reset this name on your other devices', () => forgetLabelRemote(key));
    return;
  }
  cache[key] = clean;
  storeAll();
  remote('save this name for your other devices', () => saveLabelRemote(key, clean));
}

/** The team of a person: their lead's computer + project (subagents count toward their lead). */
export function teamKey(a: Agent): string | null {
  const lead = a.info.parent ? app.agents.find((o) => o.id === a.info.parent) ?? a : a;
  return lead.info.project ? `team:${lead.info.machine ?? ''}|${lead.info.project}` : null;
}

export function teamName(a: Agent): string {
  const key = teamKey(a);
  const lead = a.info.parent ? app.agents.find((o) => o.id === a.info.parent) ?? a : a;
  return (key && cache[key]) || lead.info.project || 'No project';
}

export function roomKey(floorId: string, roomId: string): string {
  return `room:${floorId}:${roomId}`;
}

let firstSync = true;
let syncError = '';

async function syncLabels(): Promise<void> {
  let server: Record<string, string>;
  try {
    server = (await labels()) ?? {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== syncError) {
      syncError = msg;
      app.toast(`Couldn't load your office's names: ${msg}`);
    }
    return;
  }
  syncError = '';
  if (firstSync) {
    firstSync = false;
    for (const [key, name] of Object.entries(cache)) {
      if (!server[key]) {
        remote('share a custom name', () => saveLabelRemote(key, name));
      }
    }
  }
  if (JSON.stringify(server) !== JSON.stringify(cache)) {
    cache = { ...cache, ...server };
    storeAll();
  }
}

function pollLabels(): void {
  if (deviceToken() && document.visibilityState === 'visible') {
    syncLabels();
  }
  window.setTimeout(pollLabels, SYNC_MS);
}
pollLabels();
