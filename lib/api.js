// Thin client-side fetch helpers for the board's API routes.

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no body
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fetchBoard() {
  return fetch("/api/board", { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("Failed to load board (" + res.status + ")");
    return res.json();
  });
}

export function saveDressField({ folderId, field, value, expectedUpdatedAt }) {
  return postJSON("/api/dress", { folderId, field, value, expectedUpdatedAt });
}

export function saveBulkStatus({ folderIds, status }) {
  return postJSON("/api/bulk-status", { folderIds, status });
}

export function saveCost({ scope, key, value }) {
  return postJSON("/api/cost", { scope, key, value });
}

export function saveNote({ release, text }) {
  return postJSON("/api/note", { release, text });
}

export function syncToSheet() {
  return postJSON("/api/sync-sheet", {});
}

export function renameCollection({ release, oldName, newName }) {
  return postJSON("/api/rename-collection", { release, oldName, newName });
}

export function fetchActivity(limit = 200) {
  return fetch(`/api/activity?limit=${limit}`, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("Failed to load activity (" + res.status + ")");
    return res.json();
  });
}

export function fetchAccess() {
  return fetch("/api/access", { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("Failed to load access list (" + res.status + ")");
    return res.json();
  });
}

export function saveAccess({ email, role, notes }) {
  return postJSON("/api/access", { email, role, notes });
}

export function deleteAccess({ email }) {
  return fetch("/api/access", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then(async (res) => {
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no body
    }
    if (!res.ok) throw new Error((data && data.error) || "Failed to remove access (" + res.status + ")");
    return data;
  });
}

// ---------- Drive file browser, resync and client review ----------
//
// Every call here optionally carries a client review token. The dashboard
// passes none and is authenticated by its session cookie; the public review
// page passes one, which is the only credential it has. Sending it as a
// header rather than in the query string keeps it out of server access logs.

function authHeaders(auth, extra) {
  const headers = { ...(extra || {}) };
  if (auth?.token) headers["x-review-token"] = auth.token;
  if (auth?.reviewerName) headers["x-reviewer-name"] = auth.reviewerName;
  return headers;
}

async function readError(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no body
  }
  const err = new Error((data && data.error) || `Request failed (${res.status})`);
  err.status = res.status;
  return err;
}

async function requestJSON(url, { method = "GET", body, auth } = {}) {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: authHeaders(auth, body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export function driveList({ dressId, folderId, auth }) {
  const qs = new URLSearchParams({ dressId });
  if (folderId) qs.set("folderId", folderId);
  return requestJSON(`/api/drive/list?${qs}`, { auth });
}

/**
 * Preview URL for a Drive image, streamed through our own server.
 *
 * Deliberately carries NO token. An <img> cannot send a header, so review
 * clients are authenticated on these requests by the httpOnly cookie that
 * startReviewSession sets. Putting the token in the URL instead wrote the
 * credential into access logs, history and the disk cache once per image.
 */
export function driveThumbUrl({ fileId, dressId, size }) {
  const qs = new URLSearchParams({ fileId, dressId });
  if (size) qs.set("size", String(size));
  return `/api/drive/thumb?${qs}`;
}

/** URL for a real download of the file's own bytes (see driveThumbUrl above
 * for why this is a separate route from the preview one). */
export function driveDownloadUrl({ fileId, dressId }) {
  const qs = new URLSearchParams({ fileId, dressId });
  return `/api/drive/download?${qs}`;
}

/** Trades the review URL's token for an httpOnly cookie. */
export function startReviewSession({ token }) {
  return requestJSON("/api/review/session", { method: "POST", body: { token } });
}

export function driveCreateFolder({ dressId, parentId, name }) {
  return requestJSON("/api/drive/folder", { method: "POST", body: { dressId, parentId, name } });
}

export function driveTrashFile({ dressId, fileId }) {
  return requestJSON("/api/drive/file", { method: "DELETE", body: { dressId, fileId } });
}

export function driveReview({ dressId, fileId, fileName, decision, reason, feedbackText, auth }) {
  return requestJSON("/api/drive/review", {
    method: "POST",
    body: { dressId, fileId, fileName, decision, reason, feedbackText },
    auth,
  });
}

export function driveComment({ dressId, fileId, text, auth }) {
  return requestJSON("/api/drive/comment", {
    method: "POST",
    body: { dressId, fileId, text },
    auth,
  });
}

export function driveResync({ release, rootFolderId }) {
  return requestJSON("/api/drive/resync", { method: "POST", body: { release, rootFolderId } });
}

export function fetchReviewBatch({ token, release, reviewerName }) {
  const qs = new URLSearchParams();
  if (release) qs.set("release", release);
  const suffix = qs.toString() ? `?${qs}` : "";
  return requestJSON(`/api/review/batch${suffix}`, { auth: { token, reviewerName } });
}

export function fetchReviewLinks() {
  return requestJSON("/api/review-links");
}

export function createReviewLink({ release, label }) {
  return requestJSON("/api/review-links", { method: "POST", body: { release, label } });
}

export function revokeReviewLink({ token }) {
  return requestJSON("/api/review-links", { method: "DELETE", body: { token } });
}

/**
 * Uploads one file, reporting progress.
 *
 * Uses XMLHttpRequest rather than fetch because fetch still gives no upload
 * progress events, and a 30 MB image with no feedback looks broken.
 */
export function driveUpload({ dressId, folderId, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("dressId", dressId);
    if (folderId) form.append("folderId", folderId);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/drive/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {
        // no body
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const err = new Error((data && data.error) || `Upload failed (${xhr.status})`);
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(form);
  });
}

// ---------- shared profile pictures ----------

export function fetchProfiles() {
  return requestJSON("/api/profile");
}

export function saveProfile({ avatar }) {
  return requestJSON("/api/profile", { method: "POST", body: { avatar } });
}
