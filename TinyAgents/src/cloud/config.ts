const HUB_KEY = 'tiny-agents.hub';

/** The Tiny Agents hub on your computer: ?hub=<url> once to point this browser at another one (remembered). */
export function hubUrl(): string {
  const fromPage = new URLSearchParams(location.search).get('hub');
  try {
    if (fromPage) {
      localStorage.setItem(HUB_KEY, fromPage.replace(/\/+$/, ''));
    }
    return localStorage.getItem(HUB_KEY) ?? 'http://127.0.0.1:7777';
  } catch {
    return fromPage?.replace(/\/+$/, '') ?? 'http://127.0.0.1:7777';
  }
}

