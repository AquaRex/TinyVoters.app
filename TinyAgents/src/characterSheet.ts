import { Dir } from './config';
import { ACCESSORIES, Appearance, CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES, PANTS_COLORS, SHOE_COLORS, SKIN_TONES, TOP_STYLES, ACCENT_COLORS, FACIAL } from './agents/appearance';
import { CHAR_FOOT_X, CHAR_FOOT_Y, CHAR_H, CHAR_W, POSES, POSE_FRAMES, Pose, characterFrame } from './render/characters';
import './art/index';
import { variant } from './art/registry';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'lineup';
const zoom = Number(q.get('zoom') ?? 4);
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
const FLOOR = '#706962';
const FLOOR_ALT = '#a36d3f';

function look(i: number): Appearance {
  const pick = <T>(arr: readonly T[], n: number) => arr[((n % arr.length) + arr.length) % arr.length];
  return {
    skin: pick(SKIN_TONES, i * 5 + 1),
    hair: pick(HAIR_STYLES, i),
    hairColor: i % 6 === 5 ? pick(HAIR_COLORS, 7 + i) : pick(HAIR_COLORS.slice(0, 7), i * 3),
    top: pick(TOP_STYLES, i * 3),
    topColor: pick(CLOTH_COLORS, i * 7 + 2),
    pants: pick(PANTS_COLORS, i * 3),
    shoes: pick(SHOE_COLORS, i),
    accessory: i % 3 === 0 ? 'none' : pick(ACCESSORIES, i * 2 + 1),
    accent: pick(ACCENT_COLORS, i),
    facial: i % 4 === 1 ? pick(FACIAL, i) : 'none',
    build: i % 5 === 2 ? 'tall' : i % 5 === 4 ? 'short' : 'regular',
  };
}

const count = Number(q.get('n') ?? 14);
const looks = Array.from({ length: count }, (_, i) => look(i + Number(q.get('offset') ?? 0)));

function sheet(cols: number, rows: number, z: number, cell: (draw: (img: HTMLCanvasElement, cx: number, cy: number) => void) => void, label?: string): void {
  const c = document.createElement('canvas');
  c.width = cols * CHAR_W * z;
  c.height = rows * CHAR_H * z;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? FLOOR : '#6a635c';
      ctx.fillRect(x * CHAR_W * z, y * CHAR_H * z, CHAR_W * z, CHAR_H * z);
    }
  }
  cell((img, cx, cy) => ctx.drawImage(img, cx * CHAR_W * z, cy * CHAR_H * z, CHAR_W * z, CHAR_H * z));
  if (label) {
    const p = document.createElement('div');
    p.textContent = label;
    p.style.padding = '4px';
    document.body.appendChild(p);
  }
  document.body.appendChild(c);
}

if (mode === 'lineup') {
  for (const z of [1, zoom]) {
    sheet(looks.length, 4, z, (draw) => {
      looks.forEach((l, i) => DIRS.forEach((d, j) => draw(characterFrame(l, d, 'stand', 0), i, j)));
    }, `lineup ${z}x`);
  }
} else if (mode === 'poses') {
  const l = looks[Number(q.get('c') ?? 0)];
  const poses = (q.get('poses')?.split(',') as Pose[]) ?? POSES;
  const dirs = (q.get('dirs')?.split(',') as Dir[]) ?? DIRS;
  const maxF = Math.max(...poses.map((p) => POSE_FRAMES[p]));
  for (const z of [1, zoom]) {
    sheet(maxF * dirs.length, poses.length, z, (draw) => {
      poses.forEach((p, row) => dirs.forEach((d, di) => {
        for (let f = 0; f < POSE_FRAMES[p]; f++) {
          draw(characterFrame(l, d, p, f, { smiling: q.has('smile') }), di * maxF + f, row);
        }
      }));
    }, `${poses.join(',')} ${z}x`);
  }
} else if (mode === 'pose') {
  const pose = (q.get('pose') ?? 'stand') as Pose;
  const f = Number(q.get('f') ?? 0);
  for (const z of [1, zoom]) {
    sheet(looks.length, 4, z, (draw) => {
      looks.forEach((l, i) => DIRS.forEach((d, j) => draw(characterFrame(l, d, pose, f), i, j)));
    }, `${pose} f${f} ${z}x`);
  }
} else if (mode === 'scene') {
  const z = zoom;
  const c = document.createElement('canvas');
  const w = 20 * 32;
  const h = 10 * 32;
  c.width = w * z;
  c.height = h * z;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(z, z);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      ctx.fillStyle = y < 5 ? ((x + y) % 2 ? FLOOR : '#6a635c') : (x % 4 === y % 4 ? '#8a5a35' : FLOOR_ALT);
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const poses: Pose[] = ['stand', 'walk', 'talk', 'wave', 'drink', 'phone', 'read', 'carry', 'sit', 'type', 'sitTalk', 'sitDrink'];
  looks.slice(0, 16).forEach((l, i) => {
    const pose = poses[i % poses.length];
    const d = DIRS[(i * 3) % 4];
    const img = characterFrame(l, d, pose, i % POSE_FRAMES[pose]);
    const fx = 24 + (i % 8) * 76;
    const fy = 70 + Math.floor(i / 8) * 150;
    ctx.fillStyle = 'rgba(24,16,28,0.26)';
    ctx.beginPath();
    ctx.ellipse(fx + 2, fy + 1, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, fx - 16, fy - 45);
  });
  document.body.appendChild(c);
}
 else if (mode === 'seated') {
  const z = zoom;
  const ids = (q.get('ids') ?? 'chair.office.charcoal,sofa.2.sage').split(',');
  const poses = (q.get('poses') ?? 'sit,type,sitTalk,sitDrink').split(',') as Pose[];
  const dirs: Dir[] = ['down', 'left', 'right', 'up'];
  const cellW = 80;
  const cellH = 80;
  const c = document.createElement('canvas');
  c.width = dirs.length * poses.length * cellW * z;
  c.height = ids.length * cellH * z;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(z, z);
  ctx.fillStyle = FLOOR;
  ctx.fillRect(0, 0, c.width, c.height);
  ids.forEach((id, row) => {
    poses.forEach((pose, pi) => dirs.forEach((d, di) => {
      const v = variant(id, d);
      if (!v) {
        return;
      }
      const ox = (pi * dirs.length + di) * cellW + 8;
      const oy = row * cellH + 16;
      const draws: { z: number; f: () => void }[] = [];
      for (const part of v.frames[0]) {
        draws.push({ z: part.z, f: () => ctx.drawImage(part.canvas, ox + part.x, oy + part.y) });
      }
      v.spots.forEach((sp, si) => {
        const fx = sp.dx * 32 + 16 + (sp.px ?? 0);
        const fy = sp.dy * 32 + 26 + (sp.py ?? 0);
        const img = characterFrame(looks[(row * 7 + si + pi) % looks.length], sp.facing, sp.pose === 'sit' ? pose : 'stand', 0);
        draws.push({ z: fy, f: () => ctx.drawImage(img, ox + fx - CHAR_FOOT_X, oy + fy - CHAR_FOOT_Y) });
      });
      draws.sort((a, b) => a.z - b.z).forEach((x) => x.f());
    }));
  });
  document.body.appendChild(c);
}
