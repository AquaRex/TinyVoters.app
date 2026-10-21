import { seeded } from '../render/pixel';
import { cream, mustard, navy, sage, skinA, skinB, skinC, terracotta } from '../art/kit/palette';

export const HAIR_STYLES = [
  'short', 'sidepart', 'spiky', 'buzz', 'bald', 'curly', 'afro', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'pigtails', 'locs',
] as const;
export const TOP_STYLES = ['tee', 'hoodie', 'shirt', 'sweater', 'jacket', 'blazer', 'cardigan', 'vest', 'turtleneck', 'dress'] as const;
export const ACCESSORIES = ['none', 'glasses', 'roundGlasses', 'headphones', 'cap', 'beanie', 'bow', 'scarf', 'badge'] as const;
export const FACIAL = ['none', 'beard', 'mustache', 'stubble'] as const;
export const BUILDS = ['regular', 'short', 'tall'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Facial = (typeof FACIAL)[number];
export type Build = (typeof BUILDS)[number];

/** A colour ramp, dark -> light: [outline, shadow, base, light, highlight?]. The swatch colour is step 2. */
export type Ramp = readonly string[];

const swatch = (ramps: readonly Ramp[]) => ramps.map((r) => r[2]);

export const SKIN_RAMPS: readonly Ramp[] = [
  ['#7a4a3c', '#cf9a86', '#f0c8b0', '#fde6d4'],
  skinA,
  skinB,
  ['#4a2a1c', '#7e4c33', '#a8714c', '#c98f66'],
  skinC,
  ['#1e120e', '#3d2419', '#5c392a', '#7a4f3a'],
];

export const HAIR_RAMPS: readonly Ramp[] = [
  ['#141019', '#211a26', '#2f2633', '#463a48', '#5e5162'],
  ['#21130f', '#3a2219', '#553326', '#704634', '#8e5f45'],
  ['#2e1a10', '#5a3420', '#7d4c2c', '#9e6a3c', '#c08e58'],
  ['#5e3e18', '#a8792f', '#d1a548', '#e9c86e', '#f7e4a0'],
  ['#3a160f', '#6e2a1a', '#9a3f22', '#c05c30', '#de8a4e'],
  ['#3c3a46', '#77768a', '#a3a3b2', '#c9c9d2', '#ececf0'],
  ['#4a1f0e', '#94451d', '#c4652a', '#e08a3c', '#f2b464'],
  ['#141c3a', '#26366e', '#3a54a0', '#5a7ccc', '#8eaee6'],
  ['#4a1a3a', '#8e3a6a', '#c45e92', '#e08ab0', '#f4b6cc'],
  ['#10302a', '#1e5a44', '#2f8060', '#4ea67a', '#86c896'],
  ['#24183e', '#4a3278', '#6e4ea6', '#9272c6', '#bba0e0'],
];
/** The first NATURAL_HAIR hair colours are natural tones; the rest are dyed. */
export const NATURAL_HAIR = 7;

export const CLOTH_RAMPS: readonly Ramp[] = [
  ['#4a1f33', '#8a3a55', '#c45d7a', '#e48a9c', '#f6b8b8'],
  [mustard[0], mustard[2], mustard[3], mustard[4], '#f5dd96'],
  ['#1c2a4a', '#2f557f', '#3d6a9a', '#5b8cc0', '#8db6d8'],
  [sage[0], sage[2], sage[3], sage[4], sage[5]],
  ['#1a3324', '#2f6b3c', '#4a8f4a', '#6fb25a', '#a3cf78'],
  [navy[0], navy[1], navy[2], navy[3], navy[4]],
  ['#4a2412', '#a85a24', '#d4802f', '#eba54a', '#f7cf7a'],
  ['#2a1a36', '#553a6e', '#7a5596', '#9c7ab8', '#c3a6d4'],
  ['#1a1a22', '#2c2d36', '#3f414c', '#575a66', '#767a85'],
  [terracotta[0], terracotta[2], terracotta[3], terracotta[4], terracotta[5]],
  ['#12302f', '#22605d', '#34827a', '#52a395', '#85c4b0'],
  ['#121218', '#1f1f27', '#2c2c35', '#3d3d48', '#55566a'],
  ['#2f4a6a', '#5b7ea6', '#7ea0c6', '#a5c2dd', '#cfe0ee'],
  [cream[1], cream[3], cream[4], cream[5], cream[6]],
  ['#3d1418', '#8a2f2c', '#b5443a', '#d4664f', '#ec9a78'],
  ['#33201a', '#6f4630', '#915f41', '#b07c58', '#d0a27a'],
];

export const PANTS_RAMPS: readonly Ramp[] = [
  ['#141c30', '#24314f', '#33466b', '#4a618a', '#6f86ab'],
  ['#101016', '#1c1c24', '#2a2a33', '#3a3a45', '#4e4e5c'],
  ['#3e3020', '#7a6446', '#a08560', '#bea47c', '#d6c29c'],
  ['#24160f', '#4a2e20', '#664030', '#845640', '#a07258'],
  ['#22252e', '#4a4e5a', '#646a78', '#868c99', '#aab0ba'],
  ['#24344e', '#4a6488', '#6a86aa', '#8ea8c6', '#b6cade'],
  ['#1e2614', '#3a4626', '#525f34', '#6c7a46', '#8c9a60'],
  ['#2a1a36', '#4a3260', '#5e4278', '#765a92', '#957ab0'],
];

export const SHOE_RAMPS: readonly Ramp[] = [
  ['#0e0e14', '#1c1c24', '#2c2c36', '#44444f', '#5c5c6a'],
  ['#5a5a68', '#a3a9b5', '#d4d7dc', '#eceef1', '#f8f8f4'],
  ['#1e120c', '#3e2618', '#5e3a22', '#80522f', '#a36d3f'],
  ['#3d2618', '#80522f', '#a36d3f', '#c48d57', '#ddb07a'],
  ['#3d1418', '#8a2f2c', '#b5443a', '#d4664f', '#ec9a78'],
  ['#1c2a4a', '#2f557f', '#3d6a9a', '#5b8cc0', '#8db6d8'],
];

export const ACCENT_RAMPS: readonly Ramp[] = [
  ['#3d1418', '#8a2f2c', '#b5443a', '#d4664f', '#ec9a78'],
  ['#1c2a4a', '#2f557f', '#3d6a9a', '#5b8cc0', '#8db6d8'],
  ['#4f3810', '#a97e2c', '#cfa244', '#e9c46f', '#f5dd96'],
  ['#1a3324', '#2f6b3c', '#4a8f4a', '#6fb25a', '#a3cf78'],
  ['#4a1f33', '#8a3a55', '#c45d7a', '#e48a9c', '#f6b8b8'],
  ['#121218', '#1f1f27', '#2c2c35', '#3d3d48', '#55566a'],
];

export const SKIN_TONES = swatch(SKIN_RAMPS);
export const HAIR_COLORS = swatch(HAIR_RAMPS);
export const CLOTH_COLORS = swatch(CLOTH_RAMPS);
export const PANTS_COLORS = swatch(PANTS_RAMPS);
export const SHOE_COLORS = swatch(SHOE_RAMPS);
export const ACCENT_COLORS = swatch(ACCENT_RAMPS);

export interface Appearance {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  top: TopStyle;
  topColor: string;
  pants: string;
  shoes: string;
  accessory: Accessory;
  accent: string;
  facial: Facial;
  /** Optional: 1 px shorter or taller than regular. */
  build?: Build;
}

export interface LookBias {
  topColors: string[];
  tops: TopStyle[];
  accessories: Accessory[];
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const nearestCache = new Map<string, Ramp>();

/** The ramp whose swatch colour is closest to `color`, so any stored or hand-picked colour shades properly. */
export function rampFor(ramps: readonly Ramp[], color: string): Ramp {
  const key = `${ramps.length}:${ramps[0][2]}:${color}`;
  const hit = nearestCache.get(key);
  if (hit) {
    return hit;
  }
  const [r, g, b] = rgb(color);
  let best = ramps[0];
  let bestD = Infinity;
  for (const ramp of ramps) {
    const [r2, g2, b2] = rgb(ramp[2]);
    const d = (r - r2) ** 2 * 2 + (g - g2) ** 2 * 4 + (b - b2) ** 2 * 3;
    if (d < bestD) {
      bestD = d;
      best = ramp;
    }
  }
  nearestCache.set(key, best);
  return best;
}

const LONG_HAIR: readonly HairStyle[] = ['long', 'wavy', 'bob', 'ponytail', 'bun', 'pigtails'];

export function randomAppearance(seed: number, bias: LookBias): Appearance {
  const r = seeded(seed);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const hair = pick(HAIR_STYLES);
  const skin = pick(SKIN_TONES);
  const darkSkin = SKIN_TONES.indexOf(skin) >= 3;
  const naturals = darkSkin && r() < 0.8 ? [0, 1, 2, 5].map((i) => HAIR_COLORS[i]) : HAIR_COLORS.slice(0, NATURAL_HAIR);
  const facialRoll = r();
  const accessory = r() < 0.55 ? pick(bias.accessories) : 'none';
  const hat = accessory === 'cap' || accessory === 'beanie';
  return {
    skin,
    hair,
    hairColor: r() < 0.88 ? pick(naturals) : pick(HAIR_COLORS.slice(NATURAL_HAIR)),
    top: pick(bias.tops),
    topColor: pick(bias.topColors),
    pants: pick(PANTS_COLORS),
    shoes: pick(SHOE_COLORS),
    accessory: hat && (hair === 'afro' || hair === 'bun') ? 'none' : accessory,
    accent: pick(ACCENT_COLORS),
    facial: LONG_HAIR.includes(hair) || facialRoll < 0.72 ? 'none' : pick(['beard', 'mustache', 'stubble'] as const),
    build: pick(['regular', 'regular', 'short', 'tall'] as const),
  };
}
