import { pushSubscribe, pushUnsubscribe } from './api';
import { VAPID_PUBLIC_KEY } from './config';

/** Set while this device gets phone alerts, so the page can skip its own duplicate in-page alerts. */
export const PUSH_FLAG_KEY = 'tiny-agents.push.v1';

/** Why this device can't get phone alerts, or null when it can. */
export function pushProblem(): string | null {
  if (!VAPID_PUBLIC_KEY) {
    return 'missing-setup';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return null;
}

async function current(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function pushOn(): Promise<boolean> {
  return !pushProblem() && !!(await current());
}

/** Asks for notification permission (must run from a tap) and registers this device with the office. */
export async function enablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY }));
  await pushSubscribe(sub.toJSON());
  setFlag(true);
}

export async function disablePush(): Promise<void> {
  const sub = await current();
  if (sub) {
    await pushUnsubscribe(sub.endpoint);
    await sub.unsubscribe();
  }
  setFlag(false);
}

function setFlag(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(PUSH_FLAG_KEY, 'on');
    } else {
      localStorage.removeItem(PUSH_FLAG_KEY);
    }
  } catch {
    // storage unavailable: in-page alerts may double up with phone alerts
  }
}
