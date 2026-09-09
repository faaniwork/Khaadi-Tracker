/**
 * Downloads every file matching `mode` across one or more dresses — a
 * single dress, a whole collection, or a whole batch, the caller just
 * passes however many dress rows it wants covered — as one zip file,
 * organised `<collection>/<dress>/<filename>` inside it.
 *
 * A browser silently blocks anything past the first of several
 * auto-triggered downloads fired in a burst (its own anti-abuse behaviour,
 * not something a delay between them works around), which is why this asks
 * the server for one zip instead of one request per file: there is only
 * ever one download for the browser to allow.
 */
export async function downloadForDresses({ dresses, mode, showToast }) {
  if (!dresses?.length) return;
  showToast?.(`Building a zip of ${dresses.length} dress${dresses.length === 1 ? "" : "es"}…`);

  let res;
  try {
    res = await fetch("/api/drive/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: dresses.map((d) => ({ dressId: d.id, dress: d.dress, collection: d.collection })),
        mode,
      }),
    });
  } catch {
    showToast?.("Could not reach the server for that download", "error");
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    showToast?.(text || `Download failed (${res.status})`, "error");
    return;
  }

  const blob = await res.blob();
  const filename =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "download.zip";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast?.("Download ready");
}
