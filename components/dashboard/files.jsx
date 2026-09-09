"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FolderPlus, RefreshCw, Loader2, Folder } from "lucide-react";
import {
  driveList,
  driveUpload,
  driveCreateFolder,
  driveTrashFile,
  driveReview,
  driveComment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { FileTile } from "@/components/files/file-tile";
import { RejectDialog } from "@/components/files/reject-dialog";
import { FeedbackDialog } from "@/components/files/feedback-dialog";
import { Dropzone } from "@/components/files/dropzone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Lightbox } from "@/components/files/lightbox";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "feedback", label: "Feedback" },
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
  const [feedbacking, setFeedbacking] = useState(null);
  const [feedbackError, setFeedbackError] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(null);
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

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
    for (const file of files) {
      try {
        await driveUpload({
          dressId: dress.id,
          folderId: currentFolder,
          file,
          onProgress: (p) => setUpload({ active: true, progress: (done + p) / files.length }),
        });
      } catch (e) {
        showToast?.(e.message || `Could not upload ${file.name}`, "error");
      }
      done += 1;
      setUpload({ active: true, progress: done / files.length });
    }
    setUpload({ active: false, progress: 0 });
    showToast?.(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`, "ok");
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

  const submitFeedback = async ({ text }) => {
    const file = feedbacking;
    setSavingFeedback(true);
    setFeedbackError("");
    try {
      const res = await driveReview({
        dressId: dress.id,
        fileId: file.id,
        fileName: file.name,
        decision: "feedback",
        feedbackText: text,
      });
      setReviewLocal(file.id, res.review);
      if (res.comment) addCommentLocal(file.id, res.comment);
      setFeedbacking(null);
      if (res.moved) load(currentFolder);
    } catch (e) {
      setFeedbackError(e.message || "Could not save that");
    } finally {
      setSavingFeedback(false);
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
      await driveTrashFile({ dressId: dress.id, fileId: file.id });
      setState((s) => ({ ...s, files: s.files.filter((f) => f.id !== file.id) }));
      showToast?.(`"${file.name}" moved to Drive trash`, "ok");
    } catch (e) {
      showToast?.(e.message || "Could not remove the file", "error");
    } finally {
      markBusy(file.id, false);
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
      else if (r.status === "feedback") acc.feedback++;
      else if (r.status === "rejected") acc.rejected++;
      return acc;
    },
    { approved: 0, feedback: 0, rejected: 0 }
  );

  const visibleFiles = statusFilter
    ? state.files.filter((f) => f.isFolder || (state.reviews[f.id]?.status || "pending") === statusFilter)
    : state.files;

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 mb-5 rise">
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
            {counts.feedback ? ` · ${counts.feedback} feedback` : ""}
            {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
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
              onFeedback={(file) => {
                setFeedbackError("");
                setFeedbacking(file);
              }}
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
      <FeedbackDialog
        key={feedbacking?.id || "none-feedback"}
        open={Boolean(feedbacking)}
        fileName={feedbacking?.name || ""}
        saving={savingFeedback}
        error={feedbackError}
        onSubmit={submitFeedback}
        onCancel={() => setFeedbacking(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmTrash)}
        title="Move this file to Drive trash?"
        description={`"${confirmTrash?.name || ""}" will disappear from here straight away. It stays restorable from Drive's trash for 30 days.`}
        confirmLabel="Move to trash"
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
          onFeedback={(file) => {
            setFeedbackError("");
            setFeedbacking(file);
          }}
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
