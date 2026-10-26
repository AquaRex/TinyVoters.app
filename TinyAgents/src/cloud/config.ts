/**
 * Where the Tiny Agents hub is. A page on the hub's own computer (localhost) talks to it directly; anywhere else the
 * page reaches it with the office code (src/cloud/link.ts).
 */
export const LOCAL_HUB = 'http://127.0.0.1:7777';

export function onHubComputer(): boolean {
  return ['localhost', '127.0.0.1'].includes(location.hostname);
}
