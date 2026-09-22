"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { driveUpload, confirmUploadComplete } from "@/lib/api";

/**
 * One upload queue for the whole app, mounted above every screen.
 *
 * It lives here rather than inside the dress's file panel because of what
 * that used to cost: the panel owned the in-flight upload, so closing the
 * dress or walking back to the board unmounted the thing holding the
 * progress, and an upload people had waited minutes for carried on into a
 * void - no progress, no result, no toast, nothing to tell them whether it
 * had worked. Sitting above the router-less view switching the dashboard
 * does, this survives every navigation in the app.
 *
 * What it cannot survive is a real page reload: the bytes being uploaded
 * live in this tab's memory, and a refresh takes the tab. So the other half
 * of "don't lose my upload" is the beforeunload guard below, which makes the
 * browser ask first.
 *
 * Strictly one file at a time, deliberately. The server names each upload
 * for its position in the folder (D2-V1-P7.jpg) by counting what is already
 * there, so two uploads in flight at once would both count the same folder
 * and both claim the same number.
 */

const UploadContext = createContext(null);

export function useUploads() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads must be used inside <UploadProvider>");
  return ctx;
}

let seq = 0;
const uid = () => `up_${Date.now()}_${seq++}`;

const isActive = (i) => i.status === "queued" || i.status === "uploading";

export function UploadProvider({ children }) {
  // The queue is held in a ref and mirrored into state: the worker loop below
  // reads and writes it between awaits, where a state value captured by a
  // closure would be several renders stale.
  const itemsRef = useRef([]);
  const [items, setItems] = useState([]);
  const runningRef = useRef(false);
  const abortsRef = useRef(new Map());

  const sync = useCallback(() => setItems(itemsRef.current.slice()), []);

  const patch = useCallback(
    (id, changes) => {
      const idx = itemsRef.current.findIndex((x) => x.id === id);
      if (idx < 0) return;
      itemsRef.current[idx] = { ...itemsRef.current[idx], ...changes };
      sync();
    },
    [sync]
  );

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((x) => x.status === "queued");
        if (!next) break;
        const controller = new AbortController();
        abortsRef.current.set(next.id, controller);
        patch(next.id, { status: "uploading", progress: 0 });
        // Rounded to whole percent before it reaches state. A large photo
        // fires progress events far faster than anything can be drawn, and
        // every one of them would otherwise be a render of every screen
        // watching the queue.
        let lastPct = -1;
        try {
          const res = await driveUpload({
            dressId: next.dressId,
            folderId: next.folderId,
            file: next.file,
            replaceFileId: next.replaceFileId,
            signal: controller.signal,
            onProgress: (p) => {
              const pct = Math.round(p * 100);
              if (pct === lastPct) return;
              lastPct = pct;
              patch(next.id, { progress: pct / 100 });
            },
          });
          patch(next.id, { status: "done", progress: 1, result: res.file });
          // A replacement overwrites an existing file's content - not a new
          // file, so the dress's own file count doesn't move for it.
          if (!next.replaceFileId) {
            confirmUploadComplete({ dressId: next.dressId }).catch(() => {
              // The upload itself already succeeded; a board count that's
              // one behind until the next resync is a much smaller problem
              // than surfacing this as an upload failure would be.
            });
          }
        } catch (e) {
          if (e?.name === "AbortError") {
            patch(next.id, { status: "cancelled" });
          } else {
            patch(next.id, { status: "error", error: e?.message || "Upload failed", code: e?.code });
            // Drive refusing to renew this person's sign-in dooms every
            // remaining file the same way, so stop rather than stack up N
            // identical failures - see DRIVE_ACCESS_REQUIRED.
            if (e?.code === "DRIVE_ACCESS_REQUIRED") {
              itemsRef.current = itemsRef.current.map((x) =>
                x.status === "queued" ? { ...x, status: "cancelled" } : x
              );
              sync();
            }
          }
        } finally {
          abortsRef.current.delete(next.id);
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [patch, sync]);

  /**
   * Queues files for one folder. `replaceFileIds` maps an original filename
   * to the id of the file it should overwrite (see the duplicate dialog);
   * anything not in it is uploaded as a new file.
   */
  const enqueue = useCallback(
    ({ dressId, folderId, folderLabel, files, replaceFileIds }) => {
      const added = Array.from(files || []).map((file) => ({
        id: uid(),
        dressId,
        folderId,
        folderLabel: folderLabel || "",
        file,
        name: file.name,
        // Lets the tile show the actual picture while it is still uploading,
        // straight off the local disk, with no round trip to Drive at all.
        previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : "",
        replaceFileId: replaceFileIds?.[file.name] || null,
        status: "queued",
        progress: 0,
        error: "",
        result: null,
        at: Date.now(),
      }));
      if (!added.length) return;
      itemsRef.current = [...itemsRef.current, ...added];
      sync();
      drain();
    },
    [drain, sync]
  );

  const cancel = useCallback(
    (id) => {
      abortsRef.current.get(id)?.abort();
      patch(id, { status: "cancelled" });
    },
    [patch]
  );

  const cancelAll = useCallback(() => {
    itemsRef.current = itemsRef.current.map((x) => (isActive(x) ? { ...x, status: "cancelled" } : x));
    sync();
    abortsRef.current.forEach((c) => c.abort());
    abortsRef.current.clear();
  }, [sync]);

  /** Drops everything that is no longer moving, so the queue does not grow forever. */
  const clearFinished = useCallback(
    (folderId) => {
      itemsRef.current = itemsRef.current.filter((x) => {
        if (folderId && x.folderId !== folderId) return true;
        if (isActive(x)) return true;
        if (x.previewUrl) URL.revokeObjectURL(x.previewUrl);
        return false;
      });
      sync();
    },
    [sync]
  );

  const active = items.filter(isActive);
  const failed = items.filter((x) => x.status === "error");

  // The one thing an in-tab queue genuinely cannot survive. The browser
  // shows its own wording here; all a page can do is ask for the prompt.
  useEffect(() => {
    if (!active.length) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active.length]);

  // Object URLs are a real allocation held until revoked, and a few hundred
  // full-size photos' worth is not nothing.
  useEffect(() => {
    const urls = itemsRef.current;
    return () => urls.forEach((x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl));
  }, []);

  const value = {
    items,
    enqueue,
    cancel,
    cancelAll,
    clearFinished,
    activeCount: active.length,
    itemsFor: useCallback((folderId) => items.filter((x) => x.folderId === folderId), [items]),
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
      <UploadStatusBar active={active} failed={failed} total={items.length} onCancelAll={cancelAll} />
    </UploadContext.Provider>
  );
}

/**
 * The floating "still going" pill.
 *
 * Its whole reason to exist is that uploads now outlive the screen that
 * started them: without something app-wide saying so, walking back to the
 * board mid-upload would look exactly like the upload having stopped, which
 * is the bug this was all meant to fix.
 */
function UploadStatusBar({ active, failed, total, onCancelAll }) {
  const [justFinished, setJustFinished] = useState(null);
  const wasActive = useRef(0);

  useEffect(() => {
    if (wasActive.current > 0 && active.length === 0) {
      setJustFinished({ ok: total - failed.length, failed: failed.length });
      const t = setTimeout(() => setJustFinished(null), 4000);
      wasActive.current = active.length;
      return () => clearTimeout(t);
    }
    wasActive.current = active.length;
    return undefined;
  }, [active.length, failed.length, total]);

  if (!active.length && !justFinished) return null;

  const uploading = active.find((x) => x.status === "uploading");
  const doneCount = total - active.length;

  return (
    <div
      role="status"
      aria-live="polite"
      // Clears the phone's fixed bottom tab bar, same as the toast does.
      className="fixed left-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-50 max-w-[min(20rem,calc(100vw-2rem))] rounded-[14px] border border-border bg-card shadow-lg px-3.5 py-3"
    >
      {active.length ? (
        <>
          <div className="flex items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            <p className="text-[13px] font-semibold text-foreground">
              Uploading {Math.min(doneCount + 1, total)} of {total}
            </p>
            <button
              type="button"
              onClick={onCancelAll}
              title="Stop uploading"
              aria-label="Stop uploading"
              className="ml-auto -mr-1 size-6 grid place-items-center rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={uploading?.name}>
            {uploading?.name || "Starting…"}
          </p>
          <div className="mt-2 rounded-full bg-muted overflow-hidden" style={{ height: 4 }}>
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.round(((doneCount + (uploading?.progress || 0)) / Math.max(total, 1)) * 100)}%`,
                background: "var(--primary)",
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {justFinished.failed ? (
            <AlertCircle className="size-3.5 shrink-0" style={{ color: "var(--destructive)" }} />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
          )}
          <p className="text-[13px] font-semibold text-foreground">
            {justFinished.failed
              ? `${justFinished.ok} uploaded, ${justFinished.failed} failed`
              : `${justFinished.ok} file${justFinished.ok === 1 ? "" : "s"} uploaded`}
          </p>
        </div>
      )}
    </div>
  );
}
