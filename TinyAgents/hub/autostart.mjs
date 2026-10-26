// Starts the hub hidden whenever you sign in to Windows (a script in your Startup folder), or with --remove stops
// doing so. The hub's output goes to ~/.tinyagents/hub.log.
//   npm run hub:autostart            npm run hub:autostart -- --remove
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.error('Autostart is set up for Windows only so far.');
  process.exit(1);
}
const startup = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Tiny Agents hub.vbs');
if (process.argv.includes('--remove')) {
  fs.rmSync(startup, { force: true });
  console.log('The hub no longer starts with Windows.');
  process.exit(0);
}
const hub = fileURLToPath(new URL('./hub.mjs', import.meta.url));
const dir = path.join(os.homedir(), '.tinyagents');
fs.mkdirSync(dir, { recursive: true });
const log = path.join(dir, 'hub.log');
const command = `cmd /c ""${process.execPath}"" ""${hub}"" >> ""${log}"" 2>&1`;
fs.writeFileSync(startup, `CreateObject("WScript.Shell").Run "${command}", 0, False\r\n`);
console.log(`The hub now starts hidden when you sign in (${startup}). Log: ${log}`);
