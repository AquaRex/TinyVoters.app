/**
 * Where the Tiny Agents hub is. A page on the hub's own computer (localhost, or the site opened there: it finds the
 * hub at LOCAL_HUB) talks to it directly; anywhere else the page reaches it with the office code (src/cloud/link.ts).
 */
export const LOCAL_HUB = 'http://127.0.0.1:7777';

async function hubAnswersHere(): Promise<boolean> {
  try {
    return (await fetch(`${LOCAL_HUB}/mind/status`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

const here = ['localhost', '127.0.0.1'].includes(location.hostname) || (await hubAnswersHere());

export function onHubComputer(): boolean {
  return here;
}
