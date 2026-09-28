/** Build one ZIP in the browser; Vercel only delivers an authorization manifest. */
const MAX_MEMORY_ZIP_BYTES = 300 * 1024 * 1024;

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

  if (!fileHandle && manifest.estimatedBytes > MAX_MEMORY_ZIP_BYTES) {
    showToast?.('This ZIP is too large for a browser download. Save it on a desktop browser that supports direct file saving, or download one dress at a time.', 'error');
    return;
  }

  const { BlobWriter, HttpReader, ZipWriter } = await import('@zip.js/zip.js');
  let fileStream;
  let writer;
  try {
    if (fileHandle) fileStream = await fileHandle.createWritable();
    writer = new ZipWriter(fileStream || new BlobWriter('application/zip'), { level: 0 });
    for (const [index, file] of manifest.files.entries()) {
      showToast?.(`Adding file ${index + 1} of ${manifest.files.length} to ZIP…`);
      await writer.add(file.name, new HttpReader(file.url), { level: 0 });
    }
    const blob = await writer.close();
    if (fileStream) {
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
    showToast?.(`ZIP download failed: ${e.message}`, 'error');
  }
}
