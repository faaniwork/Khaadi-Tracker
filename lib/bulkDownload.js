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
  showToast?.(`Preparing ${dresses.length} dress${dresses.length === 1 ? '' : 'es'}…`);

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
    showToast?.(e.message || 'Could not prepare download', 'error');
    return;
  }
  if (!manifest.files.length) {
    showToast?.('No matching files to download', 'error');
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
      showToast?.('This ZIP is too large for a browser download. Download one dress at a time.', 'error');
      return;
    }
    writer = new ZipWriter(fileStream || new BlobWriter('application/zip'), { level: 0 });
    for (const [index, file] of manifest.files.entries()) {
      showToast?.(`Adding file ${index + 1} of ${manifest.files.length} to ZIP…`);
      await writer.add(file.name, new HttpReader(file.url), { level: 0 });
    }
    const blob = await writer.close();
    if (fileStream) {
      if (temporaryFile) await temporaryFile.save();
      showToast?.('Download ready');
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
    showToast?.('Download ready');
  } catch (e) {
    if (fileStream) await fileStream.abort().catch(() => {});
    if (temporaryFile) await temporaryFile.discard();
    showToast?.(`ZIP download failed: ${e.message}`, 'error');
  }
}
