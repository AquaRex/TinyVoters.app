import { app } from '../app';
import { ux } from './prefs';

const PUSH_KEY = 'tiny-agents.push.v1';
const ICON = `${import.meta.env.BASE_URL}icons/icon-192.png`;

function phonePushOn(): boolean {
  try {
    return localStorage.getItem(PUSH_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Asks for notification permission (call from a click). Resolves whether alerts can be shown. */
export async function requestAlerts(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  return (await Notification.requestPermission()) === 'granted';
}

function selectById(id: string): void {
  window.focus();
  const a = app.agents.find((x) => x.id === id);
  if (a) {
    app.selectAgent(a);
  }
}

/**
 * Shows a system notification about agent `agentId` when alerts are on and the page is hidden or unfocused.
 * `force` skips the visibility check (the Settings test button).
 */
export async function sendAlert(title: string, body: string, agentId: string, force = false): Promise<void> {
  if (!ux.alerts || !('Notification' in window) || Notification.permission !== 'granted' || phonePushOn()) {
    return;
  }
  if (!force && !document.hidden && document.hasFocus()) {
    return;
  }
  const opts: NotificationOptions = { body, icon: ICON, tag: `tiny-agents:${agentId}`, data: { tinySelect: agentId } };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) {
    await reg.showNotification(title, opts);
    return;
  }
  const n = new Notification(title, opts);
  n.onclick = () => {
    n.close();
    selectById(agentId);
  };
}

/** Clicks on service-worker notifications come back as a message from sw.js. */
export function initNotify(): void {
  navigator.serviceWorker?.addEventListener('message', (e) => {
    const id = e.data?.tinySelect;
    if (typeof id === 'string') {
      selectById(id);
    }
  });
}
