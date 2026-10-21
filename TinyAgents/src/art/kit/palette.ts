/**
 * The Tiny Agents palette (docs/ART_BIBLE.md §2). Every ramp runs dark -> light and is hue-shifted:
 * shadows lean blue/purple, highlights lean yellow. Draw only with these colours (or `mix` between two
 * neighbouring steps of one ramp for very subtle floor/wall tones).
 */

export type Ramp = readonly string[];

export const ink = '#1f1a24';

export const cream: Ramp = ['#3b3230', '#5e504a', '#8a7a6e', '#b7a796', '#d9cbb6', '#efe4d0', '#fbf5e9'];
export const steel: Ramp = ['#262a33', '#3c414d', '#5a6070', '#7d8494', '#a3a9b5', '#c9cdd5', '#eceef1'];
export const oak: Ramp = ['#3d2618', '#5e3a22', '#80522f', '#a36d3f', '#c48d57', '#ddb07a', '#efd3a4'];
export const walnut: Ramp = ['#24160f', '#3a2419', '#553425', '#714734', '#8e5d43', '#ad7a58'];
export const teal: Ramp = ['#1d3536', '#284a4b', '#346061', '#447774', '#5b8f88'];
export const slate: Ramp = ['#20283a', '#2c374f', '#3b4966', '#4f5f80', '#6a7a98'];
export const warmgrey: Ramp = ['#33302e', '#45403d', '#5a544f', '#706962', '#8a8279'];
export const sage: Ramp = ['#26362a', '#36503b', '#4c6b4f', '#668868', '#87a684', '#adc6a5'];
export const mustard: Ramp = ['#4f3810', '#7d5a1d', '#a97e2c', '#cfa244', '#e9c46f'];
export const terracotta: Ramp = ['#42201a', '#692f20', '#8f442b', '#b65e3b', '#d4835c', '#e9ab86'];
export const leather: Ramp = ['#33201a', '#4f3123', '#6f4630', '#915f41', '#b07c58'];
export const navy: Ramp = ['#1c2236', '#283252', '#36456e', '#4b5d8c', '#6b7fab'];
export const plant: Ramp = ['#112a1c', '#1a4127', '#255b30', '#3a7a37', '#5b9a3f', '#86b84e', '#b5d36a'];
export const grass: Ramp = ['#2a4a24', '#38602c', '#4a7a34', '#5e933c', '#79ab47', '#9cc45a'];
export const dirt: Ramp = ['#4f3825', '#6b4c31', '#8a6a45', '#a8875c', '#c4a679'];
export const paving: Ramp = ['#3f4046', '#55565c', '#6f6f72', '#8c8a86', '#aaa69d', '#c6c1b5'];
export const asphalt: Ramp = ['#222328', '#2c2e34', '#383a41', '#464951'];
export const water: Ramp = ['#1b3352', '#234d74', '#2f6c96', '#4b93b6', '#7cbcd2', '#b7e0ea'];
export const skinA: Ramp = ['#6e4433', '#b9806a', '#e3b096', '#f7d4bd'];
export const skinB: Ramp = ['#5a3424', '#9c6847', '#c98e68', '#e5b48d'];
export const skinC: Ramp = ['#2e1a14', '#5a3424', '#81503a', '#a9704f'];
export const red: Ramp = ['#6e2a2a', '#a8443a', '#c95d4c'];
export const blue: Ramp = ['#22385a', '#2f557f', '#3d6a9a', '#5b8cc0'];
export const yellow: Ramp = ['#8a6420', '#c9962a', '#e3b341'];
/** Added: dark upholstery and plastics (office chairs, monitors). Cool blue-grey, warmer when lit. */
export const charcoal: Ramp = ['#17181f', '#22252e', '#2d313b', '#3a3f4a', '#4d5260', '#666b78', '#868a94'];
/** Added: wall-paint ramp for the cream wall face; sits between cream steps 4-6. */
export const paint: Ramp = ['#a8977f', '#c7b79f', '#ddd0bb', '#e8dcc6', '#f1e7d4', '#f8f0e1'];

export const markingWhite = '#e6e0cc';
export const markingYellow = '#d6b048';
export const glassTint = '#9fc3cf';
export const glassGlint = '#e3f2f5';
export const lightWarm: Ramp = ['#ffb85c', '#ffd98a'];
export const screenGlow: Ramp = ['#7fd0e8', '#bfe9f4'];
/** Contact shadows (drawn by the engine from Variant.shadows, never baked into sprites). */
export const SHADOW = 'rgba(24,16,28,0.26)';

export const RAMPS = {
  cream, steel, oak, walnut, teal, slate, warmgrey, sage, mustard, terracotta, leather, navy, plant, grass,
  dirt, paving, asphalt, water, skinA, skinB, skinC, red, blue, yellow, charcoal, paint,
} as const;
export type RampName = keyof typeof RAMPS;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear blend of two colours (t = 0 -> a, 1 -> b). Use between neighbouring steps of one ramp only. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

interface RampHit {
  ramp: Ramp;
  i: number;
}

const index = new Map<string, RampHit>();
for (const ramp of Object.values(RAMPS)) {
  ramp.forEach((c, i) => {
    if (!index.has(c)) {
      index.set(c, { ramp, i });
    }
  });
}

/** The ramp a colour belongs to (nearest ramp step by RGB distance for blended tones). */
export function rampOf(color: string): RampHit {
  const exact = index.get(color);
  if (exact) {
    return exact;
  }
  const [r, g, b] = hexToRgb(color);
  let best: RampHit = { ramp: cream, i: 0 };
  let bestD = Infinity;
  for (const [c, hit] of index) {
    const [r2, g2, b2] = hexToRgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = hit;
    }
  }
  return best;
}

/** Step a colour along its own ramp: negative = darker, positive = lighter (clamped). */
export function step(color: string, by: number): string {
  const { ramp, i } = rampOf(color);
  return ramp[Math.max(0, Math.min(ramp.length - 1, i + by))];
}

/**
 * Material tones picked from a ramp, counted from its light end so every ramp length works:
 * `hi` highlight pixels, `light` top faces, `base` front faces, `dark` undersides/side faces,
 * `deep` recesses and gaps, `line` the sel-out outline, `lineLit` the outline on top/left (lit) edges.
 * `shift` moves the whole set darker (positive) to use the deeper part of a long ramp.
 */
export interface Mat {
  line: string;
  lineLit: string;
  deep: string;
  dark: string;
  base: string;
  light: string;
  hi: string;
}

export function mat(ramp: Ramp, shift = 0): Mat {
  const n = ramp.length;
  const at = (i: number) => ramp[Math.max(0, Math.min(n - 1, i))];
  const top = n - 1 - shift;
  return {
    line: ramp[0],
    lineLit: ramp[1],
    deep: at(Math.max(1, top - 4)),
    dark: at(top - 3),
    base: at(top - 2),
    light: at(top - 1),
    hi: at(top),
  };
}
