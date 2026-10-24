import { app, Floor } from '../app';
import { defaultBuilding } from '../world/layout';
import { floorKey } from '../world/floors';

/**
 * Elevator call panel listing the building's floors (top floor first): each shows its label and head count,
 * lights up while someone there is working and pulses while someone there waits for permission. Below the keys:
 * add a floor (a new storey with the shell of the one below) and remove an added top floor.
 */
export class FloorSwitch {
  private root = document.getElementById('floorSwitch')!;
  private signature = '';
  private buttons = new Map<Floor, HTMLButtonElement>();
  private defaults = new Set(defaultBuilding().floors.map((f) => f.id));

  constructor(
    private onPick: (f: Floor) => void,
    private onAdd: () => void,
    private onRemove: (f: Floor) => void,
  ) {
    this.root.hidden = false;
  }

  update(): void {
    const floors = app.tower.floors;
    const sig = `${!!app.override}|` + floors.map((f) => `${f.id}|${f.label}`).join(';');
    if (sig !== this.signature) {
      this.signature = sig;
      this.build(floors);
    }
    const shown = app.shown;
    for (const [f, btn] of this.buttons) {
      const present = f.director.agents.filter((a) => !a.leaving && !a.hidden);
      btn.classList.toggle('on', f === shown);
      btn.classList.toggle('busy', present.some((a) => a.info.busy));
      btn.classList.toggle('waiting', present.some((a) => a.info.waiting));
      const count = present.length ? `${present.length} ${present.length === 1 ? 'person' : 'people'}` : 'Empty';
      const small = btn.querySelector('small')!;
      if (small.textContent !== count) {
        small.textContent = count;
      }
    }
    this.root.querySelector('.fs-num')!.textContent = floorKey(shown);
  }

  private build(floors: Floor[]): void {
    this.root.innerHTML = `<div class="fs-display" aria-hidden="true"><i></i><b class="fs-num"></b></div><ul></ul>`;
    const list = this.root.querySelector('ul')!;
    this.buttons.clear();
    for (const f of [...floors].reverse()) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.title = `Go to ${f.label}`;
      btn.innerHTML = `<span class="fs-key"></span><span class="fs-text"><b></b><small></small></span>`;
      btn.querySelector('.fs-key')!.textContent = floorKey(f);
      btn.querySelector('b')!.textContent = f.label;
      btn.addEventListener('click', () => this.onPick(f));
      li.append(btn);
      list.append(li);
      this.buttons.set(f, btn);
    }
    if (app.override) {
      return;
    }
    const tools = document.createElement('div');
    tools.className = 'fs-tools';
    const add = document.createElement('button');
    add.className = 'fs-add';
    add.textContent = '+ Add floor';
    add.title = 'Build a new storey on top (the shell of the floor below), then furnish it in the editor';
    add.addEventListener('click', () => this.onAdd());
    tools.append(add);
    const top = floors[floors.length - 1];
    if (!this.defaults.has(top.id)) {
      const remove = document.createElement('button');
      remove.className = 'fs-remove';
      remove.textContent = '−';
      remove.title = `Remove ${top.label}`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => this.onRemove(top));
      tools.append(remove);
    }
    this.root.append(tools);
  }
}
