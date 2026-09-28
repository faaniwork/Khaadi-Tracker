/** Build one ZIP in the browser; Vercel only delivers an authorization manifest. */
const MAX_MEMORY_ZIP_BYTES = 300 * 1024 * 1024;

async function browserDownloadStream(filename) {
  if (!('serviceWorker' in navigator) || !('TransformStream' in window)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/zip-download-sw.js', { scope: '/' });
    if (!registration.active) {
      const installing = registration.installing || registration.waiting;
      if (!installing) return null;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Download worker did not start')), 10_000);
        const onState = () => {
          if (installing.state === 'activated') {
            clearTimeout(timeout);
            installing.removeEventListener('statechange', onState);
            resolve();
          } else if (installing.state === 'redundant') {
            clearTimeout(timeout);
            installing.removeEventListener('statechange', onState);
            reject(new Error('Download worker stopped'));
          }
        };
        installing.addEventListener('statechange', onState);
        onState();
      });
    }
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Download worker did not take control')), 10_000);
        const onControl = () => {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('controllerchange', onControl);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControl, { once: true });
        if (navigator.serviceWorker.controller) onControl();
      });
    }
    const stream = new TransformStream();
    const token = crypto.randomUUID();
    const channel = new MessageChannel();
    const acknowledged = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Download worker did not answer')), 10_000);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timeout);
        channel.port1.close();
        data === 'ready' ? resolve() : reject(new Error('Download worker refused the stream'));
      };
    });
    registration.active.postMessage({ token, filename, stream: stream.readable }, [stream.readable, channel.port2]);
    await acknowledged;
    const link = document.createElement('a');
    link.href = `/zip-stream/${token}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return stream.writable;
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
  if (!fileHandle && isIOS && manifest.estimatedBytes > MAX_MEMORY_ZIP_BYTES) {
    showToast?.('This ZIP is too large for a browser download. Save it on a desktop browser that supports direct file saving, or download one dress at a time.', 'error');
    return;
  }

  const { BlobWriter, HttpReader, ZipWriter } = await import('@zip.js/zip.js');
  let fileStream;
  let writer;
  try {
    if (fileHandle) fileStream = await fileHandle.createWritable();
    else fileStream = await browserDownloadStream(manifest.filename);
    if (!fileStream && manifest.estimatedBytes > MAX_MEMORY_ZIP_BYTES) {
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
