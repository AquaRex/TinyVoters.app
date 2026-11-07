// Downloads folders of the site into a .NET runtime's in-memory file system (the engine and the compiler both read
// files from it). A folder lists its files in files.json, written by tools/build-web.sh.

export async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Missing ${url} (${response.status})`);
  return response.json();
}

/** Downloads site folder <url> into the file system at <path>; progress(loaded, total) after each file. */
export async function download(module, url, path, progress) {
  const files = await fetchJson(url + '/files.json');
  let loaded = 0;
  await Promise.all(files.map(async file => {
    const response = await fetch(url + '/' + file.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Missing ${url}/${file} (${response.status})`);
    writeFile(module, path + '/' + file, new Uint8Array(await response.arrayBuffer()));
    progress?.(++loaded, files.length);
  }));
}

/** Writes (or replaces) a file, creating its folders. */
export function writeFile(module, path, data) {
  if (module.FS) { // the engine's runtime exports the whole file system
    module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    module.FS.writeFile(path, data);
    return;
  }
  const slash = path.lastIndexOf('/'); // elsewhere only creating files is exported, which is all a download needs
  module.FS_createPath('/', path.slice(1, slash), true, true);
  module.FS_createDataFile(path.slice(0, slash), path.slice(slash + 1), data, true, true, true);
}
