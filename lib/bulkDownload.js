/** Build one ZIP in the browser; Vercel only delivers an authorization manifest. */
export async function downloadForDresses({ dresses, mode, showToast }) {
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

  const { BlobWriter, HttpReader, ZipWriter } = await import('@zip.js/zip.js');
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0 });
  try {
    for (const [index, file] of manifest.files.entries()) {
      showToast?.(`Adding file ${index + 1} of ${manifest.files.length} to ZIP…`);
      await writer.add(file.name, new HttpReader(file.url), { level: 0 });
    }
    const blob = await writer.close();
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
    await writer.close().catch(() => {});
    showToast?.(`ZIP download failed: ${e.message}`, 'error');
  }
}
