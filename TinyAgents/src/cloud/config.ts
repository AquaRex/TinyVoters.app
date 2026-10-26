const HUB_KEY = 'tiny-agents.hub';
const LOCAL_HUB = 'http://127.0.0.1:7777';

/**
 * The Tiny Agents hub this browser talks to: the address entered in Connect (your PC's IP and port, see
 * hub/README.md), or the hub on this computer when the page is served from it ('' until one is known).
 */
export function hubUrl(): string {
  try {
    const saved = localStorage.getItem(HUB_KEY);
    if (saved) {
      return saved;
    }
  } catch {
    // storage unavailable: only a page on the hub's own computer finds it
  }
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? LOCAL_HUB : '';
}

/** Saves the hub address typed in Connect ("89.11.166.148:4888" or a full https://… address). */
export function setHubUrl(address: string): void {
  const trimmed = address.trim().replace(/\/+$/, '');
  try {
    localStorage.setItem(HUB_KEY, /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    // storage unavailable: nothing to remember it in
  }
}
