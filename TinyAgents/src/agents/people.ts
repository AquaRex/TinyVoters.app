import { app } from '../app';
import { deviceToken, forgetPersonRemote, people, savePersonRemote } from '../cloud/api';
import { hash } from '../render/pixel';
import { Appearance, randomAppearance } from './appearance';
import { Profession } from './professions';

export interface Person {
  name: string;
  look: Appearance;
}

const STORAGE_KEY = 'tiny-agents.people.v1';

const NAMES = [
  'Ada', 'Bea', 'Cleo', 'Dot', 'Eli', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jun', 'Kit', 'Lev', 'Mika', 'Nia', 'Oto',
  'Pip', 'Quin', 'Rae', 'Sol', 'Tam', 'Uma', 'Vik', 'Wren', 'Xan', 'Yui', 'Zed', 'Alba', 'Bo', 'Cy', 'Dara',
  'Emi', 'Fox', 'Gil', 'Hal', 'Isa', 'Joss', 'Kai', 'Lou', 'Moss', 'Nell', 'Oz', 'Pia', 'Remy', 'Sage', 'Teo',
  'Vera', 'Wade', 'Yara', 'Zoe', 'Ari', 'Bram', 'Cass', 'Dex', 'Esme', 'Ford', 'Gem', 'Huck', 'Iris', 'Jem',
];

const SYNC_MS = 30000;

/** Customized people by slot. localStorage is the cache; when paired, the office's copy (shared by every device) wins. */
function loadAll(): Record<string, Person> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function storeAll(all: Record<string, Person>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: customization lasts for this session
  }
}

function remote(what: string, call: () => Promise<void>): void {
  if (deviceToken()) {
    call().catch((e) => app.toast(`Couldn't ${what}: ${e instanceof Error ? e.message : e}`));
  }
}

/** Shows a changed person on everyone sitting in that slot, on every floor. */
function applyLive(slot: string, person: Person): void {
  for (const a of app.agents) {
    if (a.slot === slot) {
      a.setPerson({ ...person });
    }
  }
}

let firstSync = true;
let syncError = '';

/** Pulls the office's people (server wins); on the first sync also uploads local ones the office lacks. */
async function syncPeople(): Promise<void> {
  let server: Record<string, Person>;
  try {
    server = (await people()) ?? {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== syncError) {
      syncError = msg;
      app.toast(`Couldn't load your office's people: ${msg}`);
    }
    return;
  }
  syncError = '';
  const local = loadAll();
  if (firstSync) {
    firstSync = false;
    for (const [slot, person] of Object.entries(local)) {
      if (!server[slot]) {
        remote('share a customized person', () => savePersonRemote(slot, person));
      }
    }
  }
  let changed = false;
  for (const [slot, person] of Object.entries(server)) {
    if (JSON.stringify(local[slot]) !== JSON.stringify(person)) {
      local[slot] = person;
      changed = true;
      applyLive(slot, person);
    }
  }
  if (changed) {
    storeAll(local);
  }
}

function pollPeople(): void {
  if (deviceToken() && document.visibilityState === 'visible') {
    syncPeople();
  }
  window.setTimeout(pollPeople, SYNC_MS);
}
pollPeople();

/** The default person for a seat. Demo staff pass their fixed name. */
export function generatedPerson(slot: string, profession: Profession, name?: string): Person {
  const h = hash(slot);
  return {
    name: name ?? NAMES[h % NAMES.length],
    look: randomAppearance(h, profession.look),
  };
}

export function personFor(slot: string, profession: Profession, name?: string): Person {
  return loadAll()[slot] ?? generatedPerson(slot, profession, name);
}

export function savePerson(slot: string, person: Person): void {
  const all = loadAll();
  all[slot] = person;
  storeAll(all);
  remote('save this person for your other devices', () => savePersonRemote(slot, person));
}

export function forgetPerson(slot: string): void {
  const all = loadAll();
  delete all[slot];
  storeAll(all);
  remote('reset this person on your other devices', () => forgetPersonRemote(slot));
}

/**
 * Moves a customization saved under the old per-role seat (`lead#0`) to the new machine + project slot, the
 * first time that slot shows up without a person of its own.
 */
export function adoptLegacy(slot: string, legacy: string): void {
  const all = loadAll();
  const old = all[legacy];
  if (all[slot] || !old) {
    return;
  }
  savePerson(slot, old);
  forgetPerson(legacy);
}

/** The person's name for a slot: the saved one, else `fixed` (demo staff), else the generated default. */
export function nameFor(slot: string, fixed?: string): string {
  return loadAll()[slot]?.name ?? fixed ?? NAMES[hash(slot) % NAMES.length];
}

/**
 * Seat of a Claude session: the same computer + project is the same person (`staff:<machine>|<project>`, `#2`…
 * while several sessions of one repo run at once). Subagents hang off their lead's seat by type, so recurring
 * helpers look the same too.
 */
export function staffSlot(info: { machine?: string; project: string; kind: 'main' | 'sub'; type: string }, parentSlot: string | undefined, used: Set<string>): string {
  const lead = `staff:${info.machine ?? ''}|${info.project}`;
  const base = info.kind === 'sub' ? `${parentSlot ?? lead}>${info.type}` : lead;
  if (!used.has(base)) {
    return base;
  }
  let n = 2;
  while (used.has(`${base}#${n}`)) {
    n++;
  }
  return `${base}#${n}`;
}

const DESKS_KEY = 'tiny-agents.desks.v1';

function loadDesks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DESKS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** The desk spot key this seat used last time. */
export function lastDesk(slot: string): string | null {
  return loadDesks()[slot] ?? null;
}

export function rememberDesk(slot: string, key: string): void {
  const all = loadDesks();
  if (all[slot] === key) {
    return;
  }
  all[slot] = key;
  try {
    localStorage.setItem(DESKS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the desk is remembered for this visit only
  }
}
