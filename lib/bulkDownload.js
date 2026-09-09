import { driveList, driveDownloadUrl } from "@/lib/api";

const STAGGER_MS = 400;

function matchesMode(fileId, reviews, comments, mode) {
  if (mode === "all") return true;
  const status = reviews?.[fileId]?.status || "pending";
  if (mode === "approved") return status === "approved";
  // "approved_or_commented": approved, or still open but with a comment
  // thread on it — the two states a client would actually want to pull
  // down once they're done reviewing a batch.
  return status === "approved" || (comments?.[fileId] || []).length > 0;
}

function clickDownload(url) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Downloads every file matching `mode` across one or more dresses — a
 * single dress, a whole collection, or a whole batch, the caller just
 * passes however many dress rows it wants covered. One browser download per
 * file rather than a server-built zip, so a request never risks a
 * serverless timeout on a very large batch; staggered rather than fired all
 * at once, since a burst of simultaneous downloads reads to a browser as a
 * popup flood and some of them get silently dropped.
 */
export async function downloadForDresses({ dresses, mode, showToast }) {
  if (!dresses?.length) return;
  const targets = [];
  for (const dress of dresses) {
    try {
      const data = await driveList({ dressId: dress.id });
      (data.files || [])
        .filter((f) => !f.isFolder)
        .forEach((f) => {
          if (matchesMode(f.id, data.reviews, data.comments, mode)) {
            targets.push({ fileId: f.id, dressId: dress.id });
          }
        });
    } catch {
      showToast?.(`Could not read "${dress.dress}" — skipped it`, "error");
    }
  }
  if (!targets.length) {
    showToast?.("No files match that", "error");
    return;
  }
  showToast?.(`Downloading ${targets.length} file${targets.length === 1 ? "" : "s"}…`);
  targets.forEach((t, i) => {
    setTimeout(() => clickDownload(driveDownloadUrl(t)), i * STAGGER_MS);
  });
}
