/** Practical-UX preferences (alerts, sound, music, ambient), kept in localStorage. */
export interface UxPrefs {
  alerts: boolean;
  sound: boolean;
  music: boolean;
  volume: number;
  /** ambient mode also goes fullscreen */
  fullscreen: boolean;
}

const KEY = 'tiny-agents.ux.v1';
const DEFAULTS: UxPrefs = { alerts: false, sound: false, music: false, volume: 0.5, fullscreen: true };

export const ux: UxPrefs = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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
