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
