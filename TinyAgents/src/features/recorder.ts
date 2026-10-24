import { app } from '../app';
import type { Agent, AgentInfo } from '../agents/agent';
import { registerExtension } from '../agents/director';

/** One roster change: `info` null means the agent left. `t` is epoch ms. */
export interface RosterEvent {
  t: number;
  id: string;
  info: AgentInfo | null;
}

/** This page session's roster changes on every floor, for the day replay when the device isn't paired. */
export const recording: RosterEvent[] = [];

registerExtension((director) => {
  const live = () => app.floors.some((f) => f.director === director);
  const left = new Set<Agent>();
  const push = (id: string, info: AgentInfo | null) => {
    if (live()) {
      recording.push({ t: Date.now(), id, info });
    }
  };
  return {
    onSpawn: (a) => push(a.id, a.info),
    onInfo: (a, _was, now) => push(a.id, now),
    update() {
      for (const a of director.agents) {
        if (a.leaving && !left.has(a)) {
          left.add(a);
          push(a.id, null);
        }
      }
    },
    onGone: (a) => left.delete(a),
  };
});
