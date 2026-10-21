/** Light presets (engine-drawn glows). Positions are footprint-relative px. */
import { Light } from '../types';
import { lightWarm, screenGlow } from './palette';

/** Warm lamp light (floor lamps, sconces, pendants). */
export function warmLight(x: number, y: number, radius = 72, intensity = 0.55): Light {
  return { x, y, radius, color: lightWarm[1], intensity };
}

/** Soft cool glow from a monitor or TV. */
export function screenLight(x: number, y: number, radius = 26, intensity = 0.32): Light {
  return { x, y, radius, color: screenGlow[0], intensity };
}
