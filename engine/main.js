// Starts the .NET runtime, then drives the engine: one Frame per animation frame, with the canvas sized to the window
// in device pixels, and keyboard, mouse and wheel input forwarded as they happen.
//
// The engine reads and writes files through the browser's in-memory file system. Before it starts, the folders named
// in preload.json (written by tools/build-web.sh) are downloaded into it: the game in the player; templates and the
// compiler's reference assemblies in the editor. The editor then opens projects through the imports below: a folder
// on the user's computer (kept in step with the in-memory copy by FolderSync) or a sample shipped with the site. Its
// C# compiler runs in a hidden frame (compiler/, a separate .NET runtime; see TinyEngine.Web.Compiler).
import { dotnet } from './_framework/dotnet.js';
import { download, fetchJson, writeFile as writeModuleFile } from './files.js';

Error.stackTraceLimit = 50; // engine errors surface deep inside the runtime

const canvas = document.getElementById('canvas');
const status = document.getElementById('status');
const fail = message => { status.textContent = message; console.error(message); };
const isMac = /Mac/.test(navigator.platform);

if (!document.createElement('canvas').getContext('webgl2')) {
  fail('This browser does not support WebGL 2.');
  throw new Error('WebGL 2 unavailable');
}

let FS = null;          // Emscripten's file system, once the runtime exists
let app = null;         // the engine's exports (WebApp)
let editorMode = false; // the editor, rather than a game
let compiler = null;    // the compiler frame's window, in the editor
const syncs = [];       // folders on disk being kept in step

try {
  const runtime = await dotnet
    .withOnConfigLoaded(() => status.textContent = 'Loading the engine…')
    .create();
  FS = runtime.Module.FS;
  runtime.setModuleImports('main.js', {
    setTitle: title => document.title = title,
    pickFolder,
    openSample,
    samples: () => sampleNames,
    compileScripts: request => compiler.compileScripts(request),
  });
  const preload = await fetchJson('preload.json');
  editorMode = preload.includes('templates');
  const sampleNames = editorMode ? await fetchJson('samples/index.json').catch(() => []) : [];
  const compilerLoaded = editorMode ? loadCompiler() : null;
  for (const folder of preload)
    await download(runtime.Module, folder, '/' + folder, (n, total) => status.textContent = `Loading ${folder}… ${n}/${total}`);
  if (compilerLoaded) {
    status.textContent = 'Loading the C# compiler…';
    await compilerLoaded;
  }
  status.textContent = 'Starting…';
  await new Promise(requestAnimationFrame); // let the message show before the (synchronous) start
  await runtime.runMain();
  app = (await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)).TinyEngine.Web.WebApp;
  status.remove();
  start();
} catch (e) {
  fail('Could not start: ' + (e?.message ?? e));
}

function writeFile(path, data) {
  writeModuleFile({ FS }, path, data);
}

/** Starts the compiler frame; resolves once it can compile. */
async function loadCompiler() {
  const frame = document.createElement('iframe');
  frame.src = 'compiler/index.html';
  frame.style.display = 'none';
  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = () => reject(new Error('Could not load the C# compiler.'));
    document.body.append(frame);
  });
  await frame.contentWindow.compilerReady;
  compiler = frame.contentWindow;
}

// ---- Projects (editor) ----

/** Loads a shipped sample into memory (once) and returns its path. Changes to it aren't saved anywhere. */
async function openSample(name) {
  const path = '/samples/' + name;
  if (!FS.analyzePath(path + '/project.json').exists) await download({ FS }, 'samples/' + encodeURIComponent(name), path);
  return path;
}

/** Asks for a folder on the user's computer, copies it into memory and keeps the two in step. Null if cancelled. */
async function pickFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error(navigator.brave
      ? 'Brave has opening local folders turned off: enable brave://flags/#file-system-access-api and restart Brave.'
      : 'This browser can\'t open folders on your computer. Use Chrome or Edge (or Brave with brave://flags/#file-system-access-api).');
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'tinyengine-project', mode: 'readwrite' });
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
  let root = '/projects/' + handle.name;
  for (let n = 2; FS.analyzePath(root).exists; n++) root = `/projects/${handle.name} ${n}`;
  FS.mkdirTree(root);
  const sync = new FolderSync(handle, root);
  await sync.pullDisk(false);
  syncs.push(sync);
  return root;
}

/**
 * Keeps a folder on disk and its copy in memory in step, once a second: files the engine wrote go to disk, files
 * changed on disk (in a code editor, say) come into memory and the engine is told. Each file remembers the stamps
 * (modified time and size) both sides had when they last matched, so only real changes move; if both sides changed,
 * the engine's version wins.
 */
class FolderSync {
  static skipped = new Set(['bin', 'obj', 'node_modules']); // build output, at the project's top level

  constructor(handle, root) {
    this.handle = handle;
    this.root = root;
    this.known = new Map(); // relative path -> { mem, disk } stamps
    this.busy = false;
    this.failed = false;
  }

  async tick() {
    if (this.busy || this.failed) return;
    this.busy = true;
    try {
      await this.pushMemory();
      await this.pullDisk(true);
    } catch (e) {
      // Usually a revoked permission; the in-memory copy keeps working, but stops reaching the disk.
      this.failed = true;
      console.error(`Stopped saving to "${this.handle.name}" on disk:`, e);
      alert(`TinyEngine can no longer save to the folder "${this.handle.name}" (${e.message}). Reload the page and open it again.`);
    } finally {
      this.busy = false;
    }
  }

  async pushMemory() {
    const seen = new Set();
    for (const path of this.memoryFiles(this.root, '')) {
      seen.add(path);
      const stamp = memoryStamp(this.root + '/' + path);
      const known = this.known.get(path);
      if (known?.mem === stamp) continue;
      const file = await this.diskFile(path, true);
      const writable = await file.createWritable();
      await writable.write(FS.readFile(this.root + '/' + path));
      await writable.close();
      this.known.set(path, { mem: stamp, disk: diskStamp(await file.getFile()) });
    }
    for (const path of [...this.known.keys()]) {
      if (seen.has(path)) continue;
      await this.removeFromDisk(path);
      this.known.delete(path);
    }
  }

  async pullDisk(notify) {
    const seen = new Set();
    const changed = [];
    for await (const [path, handle] of this.diskFiles(this.handle, '')) {
      seen.add(path);
      const file = await handle.getFile();
      const stamp = diskStamp(file);
      if (this.known.get(path)?.disk === stamp) continue;
      const full = this.root + '/' + path;
      writeFile(full, new Uint8Array(await file.arrayBuffer()));
      this.known.set(path, { mem: memoryStamp(full), disk: stamp });
      changed.push(full);
    }
    for (const path of [...this.known.keys()]) {
      if (seen.has(path)) continue;
      const full = this.root + '/' + path;
      if (FS.analyzePath(full).exists) FS.unlink(full);
      this.known.delete(path);
      changed.push(full);
    }
    if (notify) for (const path of changed) app.FileChanged(path);
  }

  *memoryFiles(folder, prefix) {
    for (const name of FS.readdir(folder)) {
      if (name === '.' || name === '..' || this.isSkipped(name, prefix)) continue;
      const full = folder + '/' + name;
      if (FS.isDir(FS.stat(full).mode)) yield* this.memoryFiles(full, prefix + name + '/');
      else yield prefix + name;
    }
  }

  async *diskFiles(folder, prefix) {
    for await (const [name, handle] of folder.entries()) {
      if (this.isSkipped(name, prefix)) continue;
      if (handle.kind === 'directory') yield* this.diskFiles(handle, prefix + name + '/');
      else yield [prefix + name, handle];
    }
  }

  isSkipped(name, prefix) {
    return name.startsWith('.') || (prefix === '' && FolderSync.skipped.has(name));
  }

  async diskFile(path, create) {
    const parts = path.split('/');
    let folder = this.handle;
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create });
    return folder.getFileHandle(parts.at(-1), { create });
  }

  async removeFromDisk(path) {
    const parts = path.split('/');
    try {
      let folder = this.handle;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
      await folder.removeEntry(parts.at(-1));
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
    }
  }
}

function memoryStamp(path) {
  const stat = FS.stat(path);
  return `${new Date(stat.mtime).getTime()}:${stat.size}`;
}

const diskStamp = file => `${file.lastModified}:${file.size}`;

// ---- Running ----

function start() {
  const ratio = () => window.devicePixelRatio || 1;
  const held = new Set();
  const key = (code, down) => {
    if (down) held.add(code); else held.delete(code);
    app.KeyEvent(code, down);
  };
  // The editor's shortcuts use Ctrl; on a Mac, Cmd plays that part as it does in native apps.
  const editorCode = code => editorMode && isMac && code.startsWith('Meta') ? code.replace('Meta', 'Control') : code;

  // Keys the engine uses shouldn't scroll the page, move focus or trigger browser shortcuts (save, open, print...).
  const captured = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
  const shortcuts = new Set(['KeyS', 'KeyD', 'KeyN', 'KeyO', 'KeyP', 'KeyZ', 'KeyY', 'KeyA', 'KeyG', 'KeyF']);
  window.addEventListener('keydown', e => {
    const command = e.ctrlKey || e.metaKey;
    if (captured.has(e.code) || (command && shortcuts.has(e.code))) e.preventDefault();
    if (!e.repeat) key(editorCode(e.code), true);
    if (e.key.length === 1 && !command) app.TextEvent(e.key);
  });
  window.addEventListener('keyup', e => {
    key(editorCode(e.code), false);
    // A Mac doesn't report other keys' release while Cmd is held: release them with it.
    if (isMac && e.code.startsWith('Meta')) for (const code of [...held]) key(code, false);
  });
  window.addEventListener('blur', () => { for (const code of [...held]) key(code, false); });

  canvas.addEventListener('mousemove', e => app.MouseMoveEvent(e.offsetX * ratio(), e.offsetY * ratio()));
  canvas.addEventListener('mousedown', e => { canvas.focus(); app.MouseButtonEvent(e.button, true); });
  window.addEventListener('mouseup', e => app.MouseButtonEvent(e.button, false));
  canvas.addEventListener('contextmenu', e => e.preventDefault()); // right-click is an engine button
  canvas.addEventListener('wheel', e => { e.preventDefault(); app.WheelEvent(-Math.sign(e.deltaX), -Math.sign(e.deltaY)); }, { passive: false });
  canvas.focus();

  // Unsaved scene changes ("*" in the title) or files not yet written to disk would be lost with the page.
  window.addEventListener('beforeunload', e => {
    if (document.title.includes(' *') || syncs.some(s => s.busy)) e.preventDefault();
  });
  setInterval(() => syncs.forEach(s => s.tick()), 1000);

  function frame(time) {
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio()));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio()));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    app.Frame(time, width, height, ratio());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
