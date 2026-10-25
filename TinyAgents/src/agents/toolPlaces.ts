import { Activity } from '../art/types';
import type { Office } from '../world/office';
import type { Agent, AgentInfo } from './agent';

/** Where a tool happens: the archive or a bookshelf, the internet kiosk, the server rack, the QA bench. */
export type Place = 'files' | 'web' | 'server' | 'qa';

export const PLACE_SPOTS: Record<Place, Activity[]> = { files: ['files', 'read'], web: ['web'], server: ['server'], qa: ['qa'] };

const TEST_RUN = /\b(tests?|testing|jest|vitest|pytest|mocha|spec|playwright|cypress|unittest|phpunit|rspec|ctest)\b|cargo test|go test|npm t\b/i;

/** A Bash detail (Claude's description or the command name) that reads like a test run. */
export function isTestRun(detail?: string): boolean {
  return !!detail && TEST_RUN.test(detail);
}

export function placeOf(info: AgentInfo): Place | null {
  switch (info.tool) {
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'LSP':
      return 'files';
    case 'WebSearch':
    case 'WebFetch':
      return 'web';
    case 'Bash':
    case 'PowerShell':
      return isTestRun(info.detail) ? 'qa' : 'server';
  }
  return null;
}

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** What the director remembers about someone's work beside the Agent itself. */
export interface WorkTrack {
  /** place of the current tool streak (thinking between calls keeps it) */
  place: Place | null;
  since: number;
  /** how long the streak must last before walking over */
  delay: number;
  /** start of the current thinking stretch, -1 while not thinking */
  thinkSince: number;
  /** earliest time for the next walk to a tool place */
  nextTrip: number;
  waitSince: number;
  /** last ring of the reception bell */
  dingAt: number;
  shredDue: boolean;
  /** what's in their hands (or pushed: the cleaners' vacuum and mop cart) */
  carry: 'folder' | 'papers' | 'sheet' | 'tray' | 'vacuum' | 'mop' | null;
  spawnedAt: number;
  /** (lead) subagents waiting for their brief */
  handoffs: Agent[];
  /** (sub) the brief was handed over, or skipped */
  briefed: boolean;
  returned: boolean;
  /** an error worth a walk to the IT help desk */
  helpDue: boolean;
  /** earliest time for the next IT visit */
  helpAt: number;
  /** when the error count last went up */
  errorAt: number;
}

const tracks = new WeakMap<Agent, WorkTrack>();

export function track(a: Agent): WorkTrack {
  let t = tracks.get(a);
  if (!t) {
    t = {
      place: null, since: 0, delay: 7, thinkSince: -1, nextTrip: 0, waitSince: 0, dingAt: -10, shredDue: false, carry: null, spawnedAt: 0,
      handoffs: [], briefed: false, returned: false, helpDue: false, helpAt: 0, errorAt: -999,
    };
    tracks.set(a, t);
  }
  return t;
}

/** A QA bench's signal lamp: amber while a run is going, then green or red for a while. */
export interface LabLamp {
  state: 'run' | 'pass' | 'fail';
  until: number;
}

const lamps = new WeakMap<Office, Map<number, LabLamp>>();

/** Lamp states by bench item uid, per office (floor). */
export function labLamps(office: Office): Map<number, LabLamp> {
  let m = lamps.get(office);
  if (!m) {
    m = new Map();
    lamps.set(office, m);
  }
  return m;
}
