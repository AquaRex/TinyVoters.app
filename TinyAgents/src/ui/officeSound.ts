import { app } from '../app';
import type { Agent } from '../agents/agent';
import { ux } from './prefs';
import { audio, burst, playCue } from './sound';

const TICK = 0.05;
/** Key presses per second for one typist (they type in bursts). */
const CLACKS_PER_TYPIST = 5;
const MAX_CLACKS = 22;
const REMIND_AFTER = 60;

/**
 * Background office sound while Sound is on: keyboard clacks that follow how many people on the visible floor
 * are typing at their desks, and a reminder chime every minute someone has been waiting for permission.
 */
export function initOfficeSound(): void {
  const waitingSince = new Map<Agent, number>();
  let lastRemind = 0;
  window.setInterval(() => {
    const now = performance.now() / 1000;
    const floor = app.shown;
    for (const a of app.agents.concat(floor?.director.agents ?? [])) {
      if (!a.info.waiting) {
        waitingSince.delete(a);
      } else if (!waitingSince.has(a)) {
        waitingSince.set(a, now);
      }
    }
    for (const a of waitingSince.keys()) {
      if (a.gone) {
        waitingSince.delete(a);
      }
    }
    if (!ux.sound || !audio() || document.hidden || !floor) {
      return;
    }
    const typists = floor.director.agents.filter((a) => a.act === 'type' && a.seated && !a.hidden).length;
    const expected = Math.min(MAX_CLACKS, typists * CLACKS_PER_TYPIST) * TICK;
    let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    while (n-- > 0) {
      burst(Math.random() * TICK, 0.02 + Math.random() * 0.02, 0.02 + Math.random() * 0.025, 1800 + Math.random() * 2400);
    }
    const overdue = [...waitingSince.entries()].some(([a, since]) => now - since > REMIND_AFTER && (!a.demo || floor.director.agents.includes(a)));
    if (overdue && now - lastRemind > REMIND_AFTER) {
      lastRemind = now;
      playCue('permission');
    }
  }, TICK * 1000);
}
