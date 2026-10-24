import type { Agent } from './agent';

const KEY = 'tiny-agents.friends.v1';
/** Affinity (0..1) from which two coworkers count as friends. */
export const FRIEND = 0.35;

/** Affinity per pair of seats (`agent.slot`), so friendships survive sessions. */
const bonds: Map<string, number> = (() => {
  try {
    return new Map<string, number>(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}')));
  } catch {
    return new Map<string, number>();
  }
})();
let saveAt = 0;

const pairKey = (a: Agent, b: Agent): string => (a.slot < b.slot ? `${a.slot}|${b.slot}` : `${b.slot}|${a.slot}`);

export function affinity(a: Agent, b: Agent): number {
  return bonds.get(pairKey(a, b)) ?? 0;
}

/** Grows (or shrinks) a pair's affinity; saved at most every few seconds. */
export function bond(a: Agent, b: Agent, amount: number): void {
  if (a === b || a.slot === b.slot) {
    return;
  }
  const k = pairKey(a, b);
  bonds.set(k, Math.max(0, Math.min(1, (bonds.get(k) ?? 0) + amount)));
  const now = performance.now();
  if (now >= saveAt) {
    saveAt = now + 5000;
    setTimeout(save, 5000);
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(bonds)));
  } catch {
    // storage unavailable: friendships last for this session
  }
}

/** Coworkers sharing a project or a lead (a session and its subagents) get along from the start. */
export function colleagues(a: Agent, b: Agent): boolean {
  return (!!a.info.project && a.info.project === b.info.project) || a.info.parent === b.id || b.info.parent === a.id;
}

/** `a`'s friends among `others`, closest first. */
export function friendsOf(a: Agent, others: readonly Agent[]): Agent[] {
  return others
    .filter((b) => b !== a && b.slot !== a.slot && affinity(a, b) >= FRIEND)
    .sort((p, q) => affinity(a, q) - affinity(a, p));
}
