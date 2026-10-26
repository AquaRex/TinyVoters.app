import { app } from '../app';
import { setAmbient } from './ambient';
import { applyMusic } from './music';
import { requestAlerts, sendAlert } from './notify';
import { saveUx, ux } from './prefs';
import { openReplay } from './replay';
import { applyAudio, playCue, uiClick } from './sound';
import { aiWanted, setAi } from '../mind/brain';
import { engine } from '../mind/engine';

type AudioSwitch = 'music' | 'office' | 'chimes' | 'weather' | 'ui';
type AudioVolume = 'master' | 'volume' | 'officeVol' | 'chimesVol' | 'weatherVol' | 'uiVol';
const SWITCH_OF: Record<Exclude<AudioVolume, 'master'>, AudioSwitch> = { volume: 'music', officeVol: 'office', chimesVol: 'chimes', weatherVol: 'weather', uiVol: 'ui' };

function aiText(): string {
  switch (engine.state) {
    case 'ready':
      return 'Running on your hub.';
    case 'loading':
      return 'Starting…';
    default:
      return engine.note;
  }
}

/** The Settings panel: General (alerts, time speed, snow, ambient mode, AI staff, replay) and Audio (master and five channels). */
export function initSettings(): void {
  const panel = document.getElementById('settings')!;
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const alertsBtn = $<HTMLButtonElement>('[data-set="alerts"]');
  const snowBtn = $<HTMLButtonElement>('[data-set="snow"]');
  const audioBtns = [...panel.querySelectorAll<HTMLButtonElement>('[data-set="music"], [data-set="office"], [data-set="chimes"], [data-set="weather"], [data-set="ui"]')];
  const sliders = [...panel.querySelectorAll<HTMLInputElement>('[data-vol]')];
  const speeds = [...panel.querySelectorAll<HTMLButtonElement>('[data-speed]')];
  const fullscreen = $<HTMLInputElement>('[data-set="fullscreen"]');
  const alertNote = $('.st-alert-note');
  const aiBtn = $<HTMLButtonElement>('[data-set="ai"]');
  const aiNote = $('.st-ai-note');

  function render(): void {
    for (const [btn, value] of [
      [alertsBtn, ux.alerts],
      [snowBtn, ux.snow],
      ...audioBtns.map((b) => [b, ux[b.dataset.set as AudioSwitch]] as const),
    ] as const) {
      btn.classList.toggle('on', value);
      btn.textContent = value ? 'On' : 'Off';
    }
    const aiOn = aiWanted();
    aiBtn.classList.toggle('on', aiOn);
    aiBtn.textContent = aiOn ? 'On' : 'Off';
    aiNote.textContent = aiText();
    for (const b of speeds) {
      b.classList.toggle('on', Number(b.dataset.speed) === ux.timeSpeed);
    }
    for (const el of sliders) {
      const key = el.dataset.vol as AudioVolume;
      el.value = String(Math.round(ux[key] * 100));
      el.disabled = key !== 'master' && !ux[SWITCH_OF[key]];
    }
    fullscreen.checked = ux.fullscreen;
    let push = false;
    try {
      push = localStorage.getItem('tiny-agents.push.v1') === 'on';
    } catch {
      // no storage: no phone push either
    }
    const blocked = 'Notification' in window && Notification.permission === 'denied';
    alertNote.textContent = !('Notification' in window)
      ? "This browser can't show notifications."
      : blocked
        ? 'Notifications are blocked for this site in your browser settings.'
        : push
          ? 'Phone push is on for this device, so alerts come from there instead.'
          : 'Only while this tab is in the background.';
  }

  alertsBtn.addEventListener('click', async () => {
    ux.alerts = !ux.alerts;
    if (ux.alerts) {
      ux.alerts = await requestAlerts();
    }
    saveUx();
    render();
  });
  $('[data-act="testAlert"]').addEventListener('click', async () => {
    const a = app.current.director.agents[0];
    if (!ux.alerts) {
      app.toast('Turn alerts on first');
      return;
    }
    await sendAlert(a ? `${a.name} needs you` : 'Tiny Agents', a ? 'Bash · npm test (test alert)' : 'Test alert', a?.id ?? '', true);
  });
  aiBtn.addEventListener('click', () => {
    setAi(!aiWanted());
    render();
  });
  engine.onChange(render);
  if (aiWanted()) {
    setAi(true);
  }
  for (const b of audioBtns) {
    b.addEventListener('click', () => {
      const key = b.dataset.set as AudioSwitch;
      ux[key] = !ux[key];
      saveUx();
      applyAudio();
      applyMusic();
      render();
      if (key === 'chimes' && ux.chimes) {
        playCue('bell');
      }
    });
  }
  for (const b of speeds) {
    b.addEventListener('click', () => {
      ux.timeSpeed = Number(b.dataset.speed);
      saveUx();
      app.timeSpeed(ux.timeSpeed);
      render();
    });
  }
  for (const el of sliders) {
    el.addEventListener('input', () => {
      ux[el.dataset.vol as AudioVolume] = Number(el.value) / 100;
      saveUx();
      applyAudio();
    });
    el.addEventListener('change', () => (el.dataset.vol === 'chimesVol' ? playCue('bell') : el.dataset.vol === 'uiVol' && uiClick('up')));
  }
  panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) =>
    tab.addEventListener('click', () => {
      panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) => t.classList.toggle('on', t === tab));
      panel.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== tab.dataset.tab));
    }),
  );
  snowBtn.addEventListener('click', () => {
    ux.snow = !ux.snow;
    saveUx();
    render();
  });
  fullscreen.addEventListener('change', () => {
    ux.fullscreen = fullscreen.checked;
    saveUx();
  });
  $('[data-act="ambient"]').addEventListener('click', () => {
    panel.hidden = true;
    setAmbient(true, true);
  });
  $('[data-act="replay"]').addEventListener('click', () => {
    panel.hidden = true;
    void openReplay();
  });
  $('.close').addEventListener('click', () => (panel.hidden = true));
  document.getElementById('settingsBtn')!.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    render();
  });
  render();
}
