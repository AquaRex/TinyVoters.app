/**
 * Practical-UX preferences (alerts, audio, ambient), kept in localStorage. Volumes are 0..1: 0.5 is the original
 * loudness, 1 twice as loud.
 */
export interface UxPrefs {
  alerts: boolean;
  master: number;
  music: boolean;
  /** music volume */
  volume: number;
  /** keyboards, mice, printer, shredder, lift */
  office: boolean;
  officeVol: number;
  /** the chimes when someone needs you or finishes */
  chimes: boolean;
  chimesVol: number;
  /** rain on the roof, windows and ground */
  weather: boolean;
  weatherVol: number;
  /** ambient mode also goes fullscreen */
  fullscreen: boolean;
  /** snow on the ground through December */
  snow: boolean;
  /** game clock speed (x real time) once a time is picked on the time bar */
  timeSpeed: number;
}

const KEY = 'tiny-agents.ux.v1';
const DEFAULTS: UxPrefs = {
  alerts: false, master: 0.5, music: false, volume: 0.5, office: false, officeVol: 0.5, chimes: false, chimesVol: 0.5,
  weather: false, weatherVol: 0.5, fullscreen: true, snow: true, timeSpeed: 1,
};

export const ux: UxPrefs = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<UxPrefs> & { sound?: boolean };
    // the old single Sound switch carries over to the three sound-effect channels
    const sound = saved.sound ?? false;
    return { ...DEFAULTS, office: sound, chimes: sound, weather: sound, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
})();

export function saveUx(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ux));
  } catch {
    // storage unavailable: preferences last for this session
  }
}
