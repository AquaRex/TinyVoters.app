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

const ODDS: Record<Season, [rain: number, snow: number]> = {
  winter: [0.18, 0.34],
  spring: [0.3, 0.02],
  summer: [0.14, 0],
  autumn: [0.34, 0.03],
};

/** The day's weather: deterministic per date with seasonal odds, or forced with ?weather=rain|snow|clear. */
export function weather(d = today()): Weather {
  if (forcedWeather === 'rain' || forcedWeather === 'snow' || forcedWeather === 'clear') {
    return forcedWeather;
  }
  let h = Math.imul(d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(), 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  const [rain, snow] = ODDS[season(d)];
  return r < snow ? 'snow' : r < snow + rain ? 'rain' : 'clear';
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
