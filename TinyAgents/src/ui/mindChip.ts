import '../mind/brain';
import { engine } from '../mind/engine';

/** A small chip under the top bar while the AI staff's model downloads or loads in the background. */
export function initMindChip(): void {
  const chip = document.createElement('div');
  chip.id = 'mindChip';
  chip.hidden = true;
  document.body.append(chip);
  engine.onChange(() => {
    chip.hidden = engine.state !== 'loading';
    const pct = Math.floor(engine.progress * 100);
    chip.textContent = engine.download ? `Minds: downloading ${pct}%` : `Minds: loading ${pct}%`;
  });
}
