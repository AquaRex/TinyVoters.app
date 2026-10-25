import { app } from '../app';
import { ux } from '../ui/prefs';

const params = new URLSearchParams(location.search);
const forcedDate = params.get('date');
const forcedWeather = params.get('weather');

/** Today's date, or the one forced with ?date=YYYY-MM-DD (keeps the real time of day). */
export function today(): Date {
  const now = new Date();
  if (!forcedDate) {
    return now;
  }
  const [y, m, d] = forcedDate.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Weather = 'clear' | 'rain' | 'snow';

export function season(d = today()): Season {
  const m = d.getMonth();
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

/** Chance of rain for each spell. */
const RAIN_ODDS: Record<Season, number> = { winter: 0.3, spring: 0.28, summer: 0.12, autumn: 0.32 };

function hash(n: number): number {
  let h = Math.imul(n, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The spell the game clock is in. A day is cut into spells of 45-90 minutes, each rolled with the season's rain odds
 * from the date and the spell's number, so every viewer sees the same weather at the same time.
 */
function spell(): { key: number; wet: boolean } {
  const d = today();
  const day = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  const minute = app.renderer.lighting.hour * 60;
  let n = 0;
  for (let end = 0; ; n++) {
    end += 45 + hash(day * 64 + n) * 45;
    if (minute < end) {
      break;
    }
  }
  return { key: day * 64 + n, wet: hash(day * 64 + n + 0x51ed) < RAIN_ODDS[season(d)] };
}

/** The weather button's flip of the current spell (rain to sunny or back); the next spell rolls on its own again. */
let flipped: { key: number; wet: boolean } | null = null;

export function toggleRain(): void {
  flipped = { key: spell().key, wet: !raining() };
}

function raining(): boolean {
  const s = spell();
  return flipped && flipped.key === s.key ? flipped.wet : s.wet;
}

/** December, unless switched off in Settings: snow on the ground all month, and what falls is snow. */
export function snowSeason(): boolean {
  return ux.snow && today().getMonth() === 11;
}

/** The weather right now: forced with ?weather=rain|snow|clear, else the current spell (flipped by the button). */
export function weather(): Weather {
  if (forcedWeather === 'rain' || forcedWeather === 'snow' || forcedWeather === 'clear') {
    return forcedWeather;
  }
  return raining() ? (snowSeason() ? 'snow' : 'rain') : 'clear';
}

export function isFriday(d = today()): boolean {
  return d.getDay() === 5;
}

/** Friday-afternoon pizza (15:00-17:00 on the director's clock). */
export function pizzaTime(hour: number): boolean {
  return isFriday() && hour >= 15 && hour < 17;
}

/** How much staff fancy a break outside today: rain and snow keep most people in. */
export function outdoorAppeal(): number {
  const w = weather();
  return w === 'rain' ? 0.1 : w === 'snow' ? 0.25 : 1;
}
