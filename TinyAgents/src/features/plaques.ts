import { cream, mustard, oak, walnut, SHADOW } from '../art/kit/palette';
import { app } from '../app';
import { TILE } from '../config';
import { Director, registerExtension } from '../agents/director';
import { MAX_LABEL, labelFor, saveLabel, teamKey, teamName } from '../agents/labels';
import { PlacedRoom, placedRoomKey, roomName, roomsOf } from '../agents/rooms';
import { Rect } from '../render/renderer';

/**
 * Signs above the doors of team offices and meeting rooms: the team's name (or the office's) on brass, the meeting
 * room's name on wood. Doors in a horizontal wall get the sign on the wall face above the door; doors in a vertical
 * wall get it standing on the wall top over the doorway, readable from the corridor. Click a sign to rename.
 */

/** Where a room's sign hangs: the door tile, and whether the door is in a vertical wall. */
interface SignSpot {
  x: number;
  y: number;
  vertical: boolean;
}

interface Sign {
  key: string;
  text: string;
  /** the default when the custom name is cleared */
  fallback: string;
  rect: Rect;
}

const FONT = '6px "Pixelify Sans", monospace';
const MAX_TEXT = 70;
const H = 10;
const OPEN_KINDS = new Set(['corridor', 'lobby', 'reception']);

/** The best door of every nav room: into a corridor or lobby first, then horizontal walls (the sign hangs flat). */
function doorSpots(d: Director): Map<number, SignSpot> {
  const { office, nav } = d;
  const named = new Map(roomsOf(d).map((r) => [r.nav, r.label.kind]));
  const best = new Map<number, [SignSpot, number]>();
  for (const item of office.layout.items) {
    if (!office.defOf(item)?.door) {
      continue;
    }
    const vertical = office.facingOf(item) !== 'down';
    const sides = vertical ? [[item.x - 1, item.y], [item.x + 1, item.y]] : [[item.x, item.y - 1], [item.x, item.y + 1]];
    const [p, q] = sides.map(([x, y]) => nav.roomOf(x, y));
    if (p <= 0 || q <= 0 || p === q) {
      continue;
    }
    for (const [room, other] of [[p, q], [q, p]]) {
      const score = (OPEN_KINDS.has(named.get(other) ?? '') ? 0 : 2) + (vertical ? 1 : 0);
      const cur = best.get(room);
      if (!cur || score < cur[1]) {
        best.set(room, [{ x: item.x, y: item.y, vertical }, score]);
      }
    }
  }
  return new Map([...best].map(([room, [spot]]) => [room, spot]));
}

function fitText(ctx: CanvasRenderingContext2D, text: string): string {
  if (ctx.measureText(text).width <= MAX_TEXT) {
    return text;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > MAX_TEXT) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

const measure = document.createElement('canvas').getContext('2d')!;

/** Sign rectangle in world px for a door, sized to its text. */
function signRect(spot: SignSpot, text: string): Rect {
  measure.font = FONT;
  const w = Math.max(20, Math.ceil(measure.measureText(fitText(measure, text)).width) + 8);
  const cx = spot.x * TILE + TILE / 2;
  const bottom = spot.vertical ? spot.y * TILE - 22 : spot.y * TILE - 6;
  return { x: Math.round(cx - w / 2), y: bottom - H, w, h: H };
}

/** Brass for teams, wood for meeting rooms: a framed board with two screws. */
function drawSign(ctx: CanvasRenderingContext2D, text: string, r: Rect, brass: boolean): void {
  const ramp = brass ? mustard : [walnut[1], walnut[2], oak[3], oak[4], oak[5]];
  const { x, y, w } = r;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + 1, y + H, w, 1);
  ctx.fillRect(x + w, y + 1, 1, H - 1);
  ctx.fillStyle = ramp[0];
  ctx.fillRect(x, y, w, H);
  ctx.fillStyle = ramp[3];
  ctx.fillRect(x + 1, y + 1, w - 2, H - 2);
  ctx.fillStyle = ramp[4];
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = ramp[2];
  ctx.fillRect(x + 1, y + H - 2, w - 2, 1);
  ctx.fillStyle = ramp[1];
  ctx.fillRect(x + 2, y + 4, 1, 1);
  ctx.fillRect(x + w - 3, y + 4, 1, 1);
  ctx.font = FONT;
  ctx.fillStyle = brass ? mustard[0] : cream[6];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, text), x + w / 2, y + H / 2 + 0.5);
}

/** Signs drawn last frame, per floor, for clicks. */
const shownSigns = new WeakMap<Director, Sign[]>();

/** The team (key and name) that claimed a room on this floor, if any. */
function teamIn(d: Director, nav: number): { key: string; name: string; project: string } | null {
  for (const [project, room] of d.projectRooms) {
    if (room !== nav) {
      continue;
    }
    const member = d.staff.agents.find((a) => !a.isSub && !a.leaving && a.info.project === project);
    const key = member && teamKey(member);
    if (member && key) {
      return { key, name: teamName(member), project };
    }
  }
  return null;
}

function signsOf(d: Director, doors: Map<number, SignSpot>): (Sign & { brass: boolean; spot: SignSpot })[] {
  const out: (Sign & { brass: boolean; spot: SignSpot })[] = [];
  const named = new Map<number, PlacedRoom>(roomsOf(d).map((r) => [r.nav, r]));
  const navs = new Set([...named.keys(), ...d.projectRooms.values()]);
  for (const nav of navs) {
    const spot = doors.get(nav);
    const room = named.get(nav);
    if (!spot || (room && room.label.kind !== 'office' && room.label.kind !== 'meeting')) {
      continue;
    }
    const team = teamIn(d, nav);
    const roomKeyed = room && placedRoomKey(d, room);
    if (team) {
      out.push({ key: team.key, text: team.name, fallback: team.project, rect: signRect(spot, team.name), brass: true, spot });
    } else if (room && roomKeyed) {
      const text = roomName(d, room);
      out.push({ key: roomKeyed, text, fallback: room.label.name, rect: signRect(spot, text), brass: room.label.kind === 'office', spot });
    }
  }
  return out;
}

registerExtension((d) => {
  let version = -1;
  let doors = new Map<number, SignSpot>();
  return {
    drawables(view, push) {
      if (version !== d.office.version) {
        d.nav.sync();
        version = d.office.version;
        doors = doorSpots(d);
      }
      const signs = signsOf(d, doors);
      shownSigns.set(d, signs);
      for (const s of signs) {
        const r = s.rect;
        if (r.x + r.w < view.x || r.x > view.x + view.w || r.y + r.h < view.y || r.y > view.y + view.h) {
          continue;
        }
        const key = s.spot.vertical ? (s.spot.y + 1) * TILE + 0.6 : s.spot.y * TILE + TILE + 0.6;
        push(key, (ctx) => drawSign(ctx, s.text, r, s.brass));
      }
    },
  };
});

let editing: HTMLInputElement | null = null;

/** Opens the inline rename box for `key` at a screen point. */
export function renameInline(key: string, current: string, fallback: string, sx: number, sy: number, done?: () => void): void {
  editing?.remove();
  const input = document.createElement('input');
  input.className = 'sign-edit';
  input.maxLength = MAX_LABEL;
  input.value = labelFor(key) ?? current;
  input.placeholder = fallback;
  input.setAttribute('aria-label', 'New name');
  input.style.left = `${Math.max(8, Math.min(window.innerWidth - 228, sx - 110))}px`;
  input.style.top = `${Math.max(8, sy - 18)}px`;
  let closed = false;
  const close = (save: boolean) => {
    if (closed) {
      return;
    }
    closed = true;
    if (save && input.value.trim() !== (labelFor(key) ?? current)) {
      saveLabel(key, input.value.trim() === fallback ? '' : input.value);
      app.toast(input.value.trim() ? `Renamed to ${input.value.trim()}` : `Back to ${fallback}`);
    }
    input.remove();
    editing = null;
    done?.();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      close(true);
    } else if (e.key === 'Escape') {
      close(false);
    }
  });
  input.addEventListener('blur', () => close(true));
  document.body.append(input);
  editing = input;
  input.focus();
  input.select();
}

/** A click on a sign of the floor on screen opens its rename box. Returns whether a sign was hit. */
export function openSignAt(wx: number, wy: number, sx: number, sy: number): boolean {
  const sign = (shownSigns.get(app.shown.director) ?? []).find((s) => wx >= s.rect.x - 1 && wx <= s.rect.x + s.rect.w + 1 && wy >= s.rect.y - 1 && wy <= s.rect.y + s.rect.h + 1);
  if (!sign) {
    return false;
  }
  renameInline(sign.key, sign.text, sign.fallback, sx, sy);
  return true;
}
