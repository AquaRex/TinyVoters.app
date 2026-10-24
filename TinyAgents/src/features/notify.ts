import { app } from '../app';
import type { Agent, AgentInfo } from '../agents/agent';
import { registerExtension } from '../agents/director';
import { sendAlert } from '../ui/notify';
import { playCue } from '../ui/sound';

/** A turn this long (seconds) or longer gets a "finished" alert. */
const LONG_TURN = 30;

/** When each agent's current turn started (performance.now ms), across all floors. */
const turnStart = new Map<string, number>();

function working(info: AgentInfo): boolean {
  return info.busy || info.waiting;
}

/**
 * Alerts and sound cues for Claude state changes: "needs you" when an agent starts waiting for permission,
 * "finished" when it ends a long turn. Alerts are for Claude agents only; cues also play for demo staff on the
 * visible floor. Directors that aren't a building floor (the day replay) stay silent.
 */
registerExtension((director) => {
  const live = () => app.floors.some((f) => f.director === director);
  const audible = (a: Agent) => !a.demo || app.current?.director === director;
  return {
    onSpawn(a) {
      if (live() && working(a.info)) {
        turnStart.set(a.id, performance.now());
      }
    },
    onInfo(a, was, now) {
      if (!live()) {
        return;
      }
      if (working(now) && !working(was)) {
        turnStart.set(a.id, performance.now());
      }
      if (now.waiting && !was.waiting) {
        if (audible(a)) {
          playCue('permission');
        }
        if (!a.demo) {
          void sendAlert(`${a.name} needs you`, [now.tool, now.detail].filter(Boolean).join(' · ') || 'Waiting for permission', a.id);
        }
      }
      if (working(was) && !working(now)) {
        const seconds = (performance.now() - (turnStart.get(a.id) ?? performance.now())) / 1000;
        turnStart.delete(a.id);
        if (seconds < LONG_TURN) {
          return;
        }
        if (audible(a)) {
          playCue('done');
        }
        if (!a.demo) {
          void sendAlert(`${a.name} finished: ${now.title ?? now.project}`, `${Math.round(seconds / 60) || '<1'} min turn · ${now.project}`, a.id);
        }
      }
    },
    onGone(a) {
      turnStart.delete(a.id);
    },
  };
});
