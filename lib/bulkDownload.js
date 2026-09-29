/** Build one ZIP in the browser; Vercel only delivers an authorization manifest. */
const MAX_MEMORY_ZIP_BYTES = 300 * 1024 * 1024;

async function browserTemporaryFile(filename) {
  if (!navigator.storage?.getDirectory) return null;
  try {
    const directory = await navigator.storage.getDirectory();
    const path = `khaadi-zip-${crypto.randomUUID()}.zip`;
    const handle = await directory.getFileHandle(path, { create: true });
    const writable = await handle.createWritable();
    return {
      writable,
      async save() {
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          directory.removeEntry(path).catch(() => {});
        }, 10 * 60_000);
      },
      async discard() { await directory.removeEntry(path).catch(() => {}); },
    };
  } catch {
    return null;
  }
}

export async function downloadForDresses({ dresses, mode, showToast, fileHandle }) {
  if (!dresses?.length) return;
  const updateProgress = (progress) => showToast?.(progress);
  updateProgress({ phase: 'preparing', message: `Preparing ${dresses.length} dress${dresses.length === 1 ? '' : 'es'}…` });

  let manifest;
  try {
    const res = await fetch('/api/drive/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: dresses.map((d) => ({ dressId: d.id })), mode }),
    });
    if (!res.ok) throw new Error((await res.text()) || `Download failed (${res.status})`);
    manifest = await res.json();
  } catch (e) {
    updateProgress({ phase: 'error', message: e.message || 'Could not prepare download' });
    return;
  }
  if (!manifest.files.length) {
    updateProgress({ phase: 'error', message: 'No matching files to download' });
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const { BlobWriter, HttpReader, ZipWriter } = await import('@zip.js/zip.js');
  let fileStream;
  let temporaryFile;
  let writer;
  try {
    if (fileHandle) fileStream = await fileHandle.createWritable();
    else {
      temporaryFile = await browserTemporaryFile(manifest.filename);
      fileStream = temporaryFile?.writable;
    }
    if (!fileStream && manifest.estimatedBytes > (isIOS ? MAX_MEMORY_ZIP_BYTES : 800 * 1024 * 1024)) {
      updateProgress({ phase: 'error', message: 'This ZIP is too large for a browser download. Download one dress at a time.' });
      return;
    }
    writer = new ZipWriter(fileStream || new BlobWriter('application/zip'), { level: 0 });
    for (const [index, file] of manifest.files.entries()) {
      const dressIndex = Math.max(0, dresses.findIndex((dress) => file.name.startsWith(`${String(dress.collection || 'Collection').replace(/[\\/]/g, '-')}/${String(dress.dress || dress.id).replace(/[\\/]/g, '-')}/`)));
      updateProgress({
        phase: 'downloading',
        message: `Downloading dress ${dressIndex + 1} of ${dresses.length}: ${dresses[dressIndex]?.dress || 'dress'} · file ${index + 1} of ${manifest.files.length}`,
        progress: Math.round(((index + 1) / manifest.files.length) * 100),
      });
      await writer.add(file.name, new HttpReader(file.url), {
        level: 0,
        onprogress: (loaded, total) => {
          if (!total) return;
          const overall = ((index + loaded / total) / manifest.files.length) * 100;
          updateProgress({
            phase: 'downloading',
            message: `Downloading dress ${dressIndex + 1} of ${dresses.length}: ${dresses[dressIndex]?.dress || 'dress'} · file ${index + 1} of ${manifest.files.length}`,
            progress: Math.max(0, Math.min(100, Math.round(overall))),
          });
        },
      });
    }
    updateProgress({ phase: 'finishing', message: 'Finishing ZIP…', progress: 100 });
    const blob = await writer.close();
    if (fileStream) {
      if (temporaryFile) await temporaryFile.save();
      updateProgress({ phase: 'complete', message: 'Download ready', progress: 100 });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = manifest.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    updateProgress({ phase: 'complete', message: 'Download ready', progress: 100 });
  } catch (e) {
    if (fileStream) await fileStream.abort().catch(() => {});
    if (temporaryFile) await temporaryFile.discard();
    updateProgress({ phase: 'error', message: `ZIP download failed: ${e.message}` });
  }
}
