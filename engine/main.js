// Starts the .NET runtime, then drives the game: one Frame per animation frame, with the canvas sized to the window
// in device pixels, and keyboard, mouse and wheel input forwarded as they happen.
import { dotnet } from './_framework/dotnet.js';

Error.stackTraceLimit = 50; // engine errors surface deep inside the runtime

const canvas = document.getElementById('canvas');
const status = document.getElementById('status');
const fail = message => { status.textContent = message; console.error(message); };

if (!document.createElement('canvas').getContext('webgl2')) {
  fail('This browser does not support WebGL 2.');
  throw new Error('WebGL 2 unavailable');
}

try {
  const runtime = await dotnet
    .withOnConfigLoaded(() => status.textContent = 'Loading the engine…')
    .create();
  runtime.setModuleImports('main.js', { setTitle: title => document.title = title });
  await loadGameFiles(runtime.Module);
  status.textContent = 'Starting…';
  await new Promise(requestAnimationFrame); // let the message show before the (synchronous) scene load
  await runtime.runMain();
  const app = (await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)).TinyEngine.Web.WebApp;
  status.remove();
  start(app);
} catch (e) {
  fail('Could not start: ' + (e?.message ?? e));
}

/** Downloads the game's files (listed in game/files.json by the build) into the in-memory file system at /game. */
async function loadGameFiles(module) {
  const files = await (await fetch('game/files.json', { cache: 'no-cache' })).json();
  let loaded = 0;
  await Promise.all(files.map(async path => {
    const response = await fetch('game/' + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Missing game file ${path} (${response.status})`);
    const data = new Uint8Array(await response.arrayBuffer());
    const slash = path.lastIndexOf('/');
    const folder = '/game' + (slash > 0 ? '/' + path.slice(0, slash) : '');
    module.FS_createPath('/', folder.slice(1), true, true);
    module.FS_createDataFile(folder, path.slice(slash + 1), data, true, true, true);
    status.textContent = `Loading the game… ${++loaded}/${files.length}`;
  }));
}

function start(app) {
  const ratio = () => window.devicePixelRatio || 1;

  // Keys the game uses shouldn't scroll the page or move focus.
  const captured = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', e => {
    if (captured.has(e.code)) e.preventDefault();
    if (!e.repeat) app.KeyEvent(e.code, true);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) app.TextEvent(e.key);
  });
  window.addEventListener('keyup', e => app.KeyEvent(e.code, false));
  window.addEventListener('blur', () => ['ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft'].forEach(c => app.KeyEvent(c, false)));

  canvas.addEventListener('mousemove', e => app.MouseMoveEvent(e.offsetX * ratio(), e.offsetY * ratio()));
  canvas.addEventListener('mousedown', e => { canvas.focus(); app.MouseButtonEvent(e.button, true); });
  window.addEventListener('mouseup', e => app.MouseButtonEvent(e.button, false));
  canvas.addEventListener('contextmenu', e => e.preventDefault()); // right-click is a game button
  canvas.addEventListener('wheel', e => { e.preventDefault(); app.WheelEvent(-Math.sign(e.deltaX), -Math.sign(e.deltaY)); }, { passive: false });
  canvas.focus();

  function frame(time) {
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio()));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio()));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    app.Frame(time, width, height, ratio());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
