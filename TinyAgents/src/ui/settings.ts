import { app } from '../app';
import { setAmbient } from './ambient';
import { applyMusic } from './music';
import { requestAlerts, sendAlert } from './notify';
import { saveUx, ux } from './prefs';
import { openReplay } from './replay';
import { playCue } from './sound';

/** The Settings panel: alerts, sound, music, ambient mode and the day replay. */
export function initSettings(): void {
  const panel = document.getElementById('settings')!;
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const alertsBtn = $<HTMLButtonElement>('[data-set="alerts"]');
  const soundBtn = $<HTMLButtonElement>('[data-set="sound"]');
  const musicBtn = $<HTMLButtonElement>('[data-set="music"]');
  const volume = $<HTMLInputElement>('[data-set="volume"]');
  const fullscreen = $<HTMLInputElement>('[data-set="fullscreen"]');
  const alertNote = $('.st-alert-note');

  function render(): void {
    for (const [btn, value] of [
      [alertsBtn, ux.alerts],
      [soundBtn, ux.sound],
      [musicBtn, ux.music],
    ] as const) {
      btn.classList.toggle('on', value);
      btn.textContent = value ? 'On' : 'Off';
    }
    volume.value = String(Math.round(ux.volume * 100));
    volume.disabled = !ux.music;
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
  soundBtn.addEventListener('click', () => {
    ux.sound = !ux.sound;
    saveUx();
    render();
    playCue('bell');
  });
  musicBtn.addEventListener('click', () => {
    ux.music = !ux.music;
    saveUx();
    applyMusic();
    render();
  });
  volume.addEventListener('input', () => {
    ux.volume = Number(volume.value) / 100;
    saveUx();
    applyMusic();
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
