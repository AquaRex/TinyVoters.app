import { registerExtension } from '../agents/director';
import { bond, colleagues } from '../agents/relationships';
import type { Conversation } from '../agents/social';

const CONV_BOND = { chat: 0.06, seated: 0.06, lunch: 0.1, meeting: 0.025 } as const;

/**
 * Friendships grow from conversations (lunch together counts most) and, slowly, from sharing a project or a
 * lead. The director's `chatPartner` and `inviteToLunch` prefer friends; the agent panel lists them.
 */
registerExtension((director) => {
  const counted = new WeakSet<Conversation>();
  let clock = 0;
  return {
    update(dt) {
      for (const c of director.convs) {
        if (!c.started || counted.has(c)) {
          continue;
        }
        counted.add(c);
        for (let i = 0; i < c.members.length; i++) {
          for (let j = i + 1; j < c.members.length; j++) {
            bond(c.members[i], c.members[j], CONV_BOND[c.kind]);
          }
        }
      }
      clock += dt;
      if (clock < 20) {
        return;
      }
      clock = 0;
      const here = director.agents.filter((a) => a.arrived && !a.leaving);
      for (let i = 0; i < here.length; i++) {
        for (let j = i + 1; j < here.length; j++) {
          if (colleagues(here[i], here[j])) {
            bond(here[i], here[j], 0.012);
          }
        }
      }
    },
  };
});
