"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FolderPlus, RefreshCw, Loader2, Folder, Trash2, Undo2 } from "lucide-react";
import {
  driveList,
  driveUpload,
  driveCreateFolder,
  driveTrashFile,
  driveRemovedFiles,
  driveRestoreFile,
  driveReview,
  driveComment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { FileTile } from "@/components/files/file-tile";
import { RejectDialog } from "@/components/files/reject-dialog";
import { Dropzone } from "@/components/files/dropzone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Lightbox } from "@/components/files/lightbox";
import { DownloadMenu } from "@/components/files/download-menu";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "commented", label: "Has comments" },
  { value: "rejected", label: "Rejected" },
];

/**
 * The team's file browser for one dress, backed by its Drive folder.
 *
 * The dress row's id IS its Drive folder id, so no mapping table is needed to
 * get from a row on the board to the actual folder.
 */
export function DressFiles({ dress, canWrite, canReview, onClose, showToast }) {
  // Most callers (the team's own dashboard) only ever pass canWrite, where
  // review and write are the same permission. The client-facing output view
  // passes both separately: a client can approve/reject but never upload,
  // trash, or create a folder.
  const reviewAllowed = canReview ?? canWrite;
  const [state, setState] = useState({ folderId: null, error: "", files: [], reviews: {}, comments: {} });
  const [refreshing, setRefreshing] = useState(false);
  const [trail, setTrail] = useState([]); // subfolders opened below the dress folder
  const [upload, setUpload] = useState({ active: false, progress: 0 });
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [postingCommentIds, setPostingCommentIds] = useState(() => new Set());
  const [rejecting, setRejecting] = useState(null);
  const [rejectError, setRejectError] = useState("");
  const [savingReject, setSavingReject] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(null);
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [bin, setBin] = useState(null); // null = closed, [] = open and empty
  const [binBusy, setBinBusy] = useState("");

  const currentFolder = trail.length ? trail[trail.length - 1].id : dress.id;
  const atRoot = trail.length === 0;

  // State is only ever written from the promise's then/catch, never
  // synchronously while the effect body runs, so opening a folder never
  // cascades an extra render pass.
  const fetchFolder = useCallback(
    (folderId, isStale) =>
      driveList({ dressId: dress.id, folderId })
        .then((data) => {
          if (isStale?.()) return;
          setState({
            folderId,
            error: "",
            files: data.files || [],
            reviews: data.reviews || {},
            comments: data.comments || {},
          });
        })
        .catch((e) => {
          if (isStale?.()) return;
          setState({ folderId, error: e.message || "Could not load the folder", files: [], reviews: {}, comments: {} });
        })
        .finally(() => setRefreshing(false)),
    [dress.id]
  );

  const load = useCallback(
    (folderId) => {
      setRefreshing(true);
      return fetchFolder(folderId);
    },
    [fetchFolder]
  );

  useEffect(() => {
    let ignore = false;
    fetchFolder(currentFolder, () => ignore);
    return () => {
      ignore = true;
    };
  }, [fetchFolder, currentFolder]);

  // Showing what we have for a different folder would be misleading, so the
  // grid waits until the state describes the folder actually being viewed.
  const loading = state.folderId !== currentFolder || refreshing;

  const markBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onFiles = async (files) => {
    setUpload({ active: true, progress: 0 });
    let done = 0;
    let failed = 0;
    let lastError = "";
    for (const file of files) {
      try {
        await driveUpload({
          dressId: dress.id,
          folderId: currentFolder,
          file,
          onProgress: (p) => setUpload({ active: true, progress: (done + p) / files.length }),
        });
      } catch (e) {
        failed += 1;
        lastError = e.message || `Could not upload ${file.name}`;
      }
      done += 1;
      setUpload({ active: true, progress: done / files.length });
    }
    setUpload({ active: false, progress: 0 });
    // One toast at the end reflecting what actually happened, not what was
    // attempted — this used to announce "Uploaded N files" unconditionally
    // even when every single one had thrown, which is exactly how a real
    // upload failure looked identical to success from here.
    const ok = files.length - failed;
    if (!ok) {
      showToast?.(lastError || "Upload failed", "error");
    } else if (failed) {
      showToast?.(`Uploaded ${ok} of ${files.length} — ${failed} failed: ${lastError}`, "error");
    } else {
      showToast?.(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`, "ok");
    }
    load(currentFolder);
  };

  const setReviewLocal = (fileId, review) =>
    setState((s) => ({ ...s, reviews: { ...s.reviews, [fileId]: review } }));

  const addCommentLocal = (fileId, comment) =>
    setState((s) => ({
      ...s,
      comments: { ...s.comments, [fileId]: [...(s.comments[fileId] || []), comment] },
    }));

  const onApprove = async (file) => {
    const already = state.reviews[file.id]?.status === "approved";
    markBusy(file.id, true);
    try {
      const res = await driveReview({
        dressId: dress.id,
        fileId: file.id,
        fileName: file.name,
        decision: already ? "pending" : "approved",
      });
      setReviewLocal(file.id, res.review);
      // An approval can move a file back out of the Rejected subfolder, which
      // changes the listing, so reload rather than guess.
      if (res.moved) load(currentFolder);
    } catch (e) {
      showToast?.(e.message || "Could not save that", "error");
    } finally {
      markBusy(file.id, false);
    }
  };

  const submitReject = async ({ reason, feedbackText }) => {
    const file = rejecting;
    setSavingReject(true);
    setRejectError("");
    try {
      const res = await driveReview({
        dressId: dress.id,
        fileId: file.id,
        fileName: file.name,
        decision: "rejected",
        reason,
        feedbackText,
      });
      setReviewLocal(file.id, res.review);
      setRejecting(null);
      load(currentFolder);
    } catch (e) {
      setRejectError(e.message || "Could not save that");
    } finally {
      setSavingReject(false);
    }
  };

  const addComment = async (file, text) => {
    setPostingCommentIds((prev) => new Set(prev).add(file.id));
    try {
      const res = await driveComment({ dressId: dress.id, fileId: file.id, text });
      addCommentLocal(file.id, res.comment);
    } catch (e) {
      showToast?.(e.message || "Could not post that comment", "error");
    } finally {
      setPostingCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };

  const doTrash = async () => {
    const file = confirmTrash;
    setConfirmTrash(null);
    markBusy(file.id, true);
    try {
      const res = await driveTrashFile({ dressId: dress.id, fileId: file.id });
      setState((s) => ({ ...s, files: s.files.filter((f) => f.id !== file.id) }));
      showToast?.(
        res?.method === "moved"
          ? `"${file.name}" moved to the Removed folder in Drive`
          : `"${file.name}" moved to Drive trash`,
        "ok"
      );
    } catch (e) {
      showToast?.(e.message || "Could not remove the file", "error");
    } finally {
      markBusy(file.id, false);
    }
  };

  /**
   * The bin: files taken off the board that Drive would not let us trash, so
   * they were parked in a "Removed" subfolder instead. Fetched only when
   * opened — most dresses have never had anything removed and there is no
   * reason to ask Drive about a folder that does not exist.
   */
  const openBin = async () => {
    if (bin) {
      setBin(null);
      return;
    }
    setBinBusy("loading");
    try {
      const res = await driveRemovedFiles({ dressId: dress.id });
      setBin(res.files || []);
    } catch (e) {
      showToast?.(e.message || "Could not read the bin", "error");
    } finally {
      setBinBusy("");
    }
  };

  const recover = async (file) => {
    setBinBusy(file.id);
    try {
      await driveRestoreFile({ dressId: dress.id, fileId: file.id });
      setBin((prev) => (prev || []).filter((f) => f.id !== file.id));
      showToast?.(`"${file.name}" is back in this dress`, "ok");
      load(currentFolder);
    } catch (e) {
      showToast?.(e.message || "Could not restore that file", "error");
    } finally {
      setBinBusy("");
    }
  };

  const createFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    setCreating(true);
    try {
      await driveCreateFolder({ dressId: dress.id, parentId: currentFolder, name });
      setNewFolder("");
      load(currentFolder);
    } catch (e) {
      showToast?.(e.message || "Could not create the folder", "error");
    } finally {
      setCreating(false);
    }
  };

  const counts = Object.values(state.reviews).reduce(
    (acc, r) => {
      if (r.status === "approved") acc.approved++;
      else if (r.status === "rejected") acc.rejected++;
      return acc;
    },
    { approved: 0, rejected: 0 }
  );
  const commentedCount = Object.values(state.comments).filter((c) => c.length).length;

  const matchesFilter = (f) => {
    if (!statusFilter) return true;
    if (statusFilter === "commented") return (state.comments[f.id] || []).length > 0;
    return (state.reviews[f.id]?.status || "pending") === statusFilter;
  };
  const visibleFiles = state.files.filter((f) => f.isFolder || matchesFilter(f));

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 mb-5 rise">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="size-3.5" /> Back
        </Button>
        <div className="min-w-0">
          <h3 className="f-heading font-bold text-base text-foreground truncate">
            {dress.dress}
            {trail.length ? <span className="text-muted-foreground"> / {trail.map((t) => t.name).join(" / ")}</span> : null}
          </h3>
          <p className="text-xs text-muted-foreground">
            {dress.collection} · {state.files.filter((f) => !f.isFolder).length} file
            {state.files.filter((f) => !f.isFolder).length === 1 ? "" : "s"}
            {counts.approved ? ` · ${counts.approved} approved` : ""}
            {commentedCount ? ` · ${commentedCount} commented` : ""}
            {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DownloadMenu dresses={[dress]} showToast={showToast} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs">
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          {trail.length ? (
            <Button variant="ghost" size="sm" onClick={() => setTrail((t) => t.slice(0, -1))}>
              <Folder className="size-3.5" /> Up
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={openBin}
              disabled={binBusy === "loading"}
              title="Files removed from this dress, and a way to put them back"
            >
              <Trash2 className="size-3.5" /> {bin ? "Hide bin" : "Bin"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => load(currentFolder)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {canWrite ? (
        <>
          <Dropzone
            disabled={upload.active}
            uploading={upload.active}
            progress={upload.progress}
            onFiles={onFiles}
            hint={
              atRoot
                ? "They go straight into this dress's Drive folder."
                : `They go into ${trail[trail.length - 1].name}.`
            }
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              placeholder="New subfolder name…"
              className="max-w-[220px]"
            />
            <Button variant="ghost" size="sm" onClick={createFolder} disabled={creating || !newFolder.trim()}>
              <FolderPlus className="size-3.5" /> {creating ? "Creating…" : "Add folder"}
            </Button>
          </div>
        </>
      ) : null}

      {bin ? (
        <div className="mt-4 rounded-[14px] border border-border bg-secondary/40 p-3">
          {!bin.length ? (
            <p className="text-xs text-muted-foreground">Nothing has been removed from this dress.</p>
          ) : (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground mb-2">
                Removed — {bin.length} file{bin.length === 1 ? "" : "s"}
              </p>
              {bin.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 py-1.5 border-b border-border last:border-0"
                >
                  <span className="text-xs text-foreground truncate flex-1 min-w-0" title={f.name}>
                    {f.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => recover(f)}
                    disabled={binBusy === f.id}
                    title="Put this file back in the dress"
                  >
                    <Undo2 className="size-3.5" /> {binBusy === f.id ? "Restoring…" : "Recover"}
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {state.error ? (
        <p className="mt-4 text-sm" style={{ color: "var(--destructive)" }}>
          {state.error}
        </p>
      ) : null}

      {loading && state.folderId !== currentFolder ? (
        <div className="py-10 grid place-items-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !visibleFiles.length && !state.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {state.files.length ? "No files match that filter." : "Nothing in this folder yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-4">
          {visibleFiles.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              dressId={dress.id}
              review={state.reviews[f.id]}
              comments={state.comments[f.id]}
              canWrite={canWrite}
              canReview={reviewAllowed}
              busy={busyIds.has(f.id)}
              postingComment={postingCommentIds.has(f.id)}
              onOpenFolder={(folder) => setTrail((t) => [...t, { id: folder.id, name: folder.name }])}
              onOpenLightbox={(f) => {
                const images = visibleFiles.filter((x) => !x.isFolder && x.isImage);
                setLightboxIndex(images.findIndex((x) => x.id === f.id));
              }}
              onApprove={onApprove}
              onReject={(file) => {
                setRejectError("");
                setRejecting(file);
              }}
              onTrash={(file) => setConfirmTrash(file)}
              onAddComment={addComment}
            />
          ))}
        </div>
      )}

      <RejectDialog
        key={rejecting?.id || "none"}
        open={Boolean(rejecting)}
        fileName={rejecting?.name || ""}
        saving={savingReject}
        error={rejectError}
        onSubmit={submitReject}
        onCancel={() => setRejecting(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmTrash)}
        title="Remove this file?"
        description={`"${confirmTrash?.name || ""}" — it stays in Drive.`}
        confirmLabel="Remove"
        onConfirm={doTrash}
        onCancel={() => setConfirmTrash(null)}
      />
      {lightboxIndex != null ? (
        <Lightbox
          files={visibleFiles}
          dressId={dress.id}
          index={lightboxIndex}
          reviews={state.reviews}
          comments={state.comments}
          canReview={reviewAllowed}
          busyIds={busyIds}
          postingCommentIds={postingCommentIds}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
          onApprove={onApprove}
          onReject={(file) => {
            setRejectError("");
            setRejecting(file);
          }}
          onAddComment={addComment}
        />
      ) : null}
    </div>
  );
}
