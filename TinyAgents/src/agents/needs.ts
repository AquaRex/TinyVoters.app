import { Personality } from './professions';

/** Each need is 0..1, where 1 is fully satisfied. */
export interface Needs {
  energy: number;
  thirst: number;
  hunger: number;
  bladder: number;
  social: number;
  comfort: number;
}

export type NeedId = keyof Needs;

export const NEED_IDS: NeedId[] = ['energy', 'thirst', 'hunger', 'bladder', 'social', 'comfort'];

export const NEED_LABELS: Record<NeedId, string> = {
  energy: 'Focus',
  thirst: 'Thirst',
  hunger: 'Hunger',
  bladder: 'Bladder',
  social: 'Social',
  comfort: 'Comfort',
};

/** Seconds for a need to drain from full to empty under normal conditions. */
const DRAIN: Record<NeedId, number> = {
  energy: 720,
  thirst: 480,
  hunger: 1500,
  bladder: 780,
  social: 600,
  comfort: 660,
};

export interface DecayContext {
  working: boolean;
  seated: boolean;
  /** someone to talk to (in a conversation) */
  company: boolean;
  /** inside the lunch window and not eaten yet */
  lunchHour: boolean;
}

export function freshNeeds(rand: () => number): Needs {
  const r = () => 0.55 + rand() * 0.4;
  return { energy: r(), thirst: r(), hunger: r(), bladder: r(), social: r(), comfort: r() };
}

export function decay(n: Needs, p: Personality, ctx: DecayContext, dt: number): void {
  const rate = (id: NeedId) => dt / DRAIN[id];
  n.energy -= rate('energy') * (ctx.working ? 1.5 : 0.6) * (0.7 + p.coffee * 0.6);
  n.thirst -= rate('thirst');
  n.hunger -= rate('hunger') * (ctx.lunchHour ? 7 : 1);
  n.bladder -= rate('bladder');
  n.social -= ctx.company ? 0 : rate('social') * (0.4 + p.sociability * 1.2);
  n.comfort -= rate('comfort') * (ctx.seated && !ctx.working ? 0.2 : ctx.working ? 1.1 : 0.9);
  clampNeeds(n);
}

export function restore(n: Needs, gains: Partial<Needs>, amount: number): void {
  for (const id of NEED_IDS) {
    n[id] += (gains[id] ?? 0) * amount;
  }
  clampNeeds(n);
}

function clampNeeds(n: Needs): void {
  for (const id of NEED_IDS) {
    n[id] = Math.max(0, Math.min(1, n[id]));
  }
}

/** How pressing a need is: 0 when satisfied, rising steeply as it empties. */
export function urgency(v: number): number {
  const d = 1 - v;
  return d * d;
}

/** The most pressing need below `threshold`, if any. */
export function criticalNeed(n: Needs, threshold: number, ids: NeedId[] = NEED_IDS): NeedId | null {
  let best: NeedId | null = null;
  for (const id of ids) {
    if (n[id] < threshold && (!best || n[id] < n[best])) {
      best = id;
    }
  }
  return best;
}
