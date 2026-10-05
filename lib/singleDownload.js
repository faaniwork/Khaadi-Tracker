/** Keep original file bytes on the browser-to-Worker path, outside Vercel. */
export async function downloadSingleFile({ fileId, dressId }) {
  const manifest = await fetch('/api/drive/download-file-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, dressId }),
  });
  if (!manifest.ok) throw new Error(await manifest.text() || 'Could not prepare download');
  const { url, name } = await manifest.json();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = name || 'image';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
