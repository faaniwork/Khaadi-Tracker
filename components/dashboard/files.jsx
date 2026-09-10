"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { ArrowLeft, FolderPlus, RefreshCw, Loader2, Folder, Trash2, Undo2, Layers, Plus } from "lucide-react";
import {
  driveList,
  driveUpload,
  driveCreateFolder,
  driveTrashFile,
  driveRemovedFiles,
  driveRestoreFile,
  driveThumbUrl,
  driveReview,
  driveComment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { dressVersionNumber } from "@/lib/constants";
import { FileTile } from "@/components/files/file-tile";
import { RejectDialog } from "@/components/files/reject-dialog";
import { Dropzone } from "@/components/files/dropzone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
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
  const [rootFiles, setRootFiles] = useState([]);
  // Reshoot rounds that already live as separate sibling "V2"/"V3" folders
  // in Drive rather than inside this dress folder - editors/admins only,
  // see the extraVersions gate in app/api/drive/list/route.js.
  const [extraVersions, setExtraVersions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [trail, setTrail] = useState([]); // subfolders opened below the dress folder
  const [upload, setUpload] = useState({ active: false, progress: 0 });
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [postingCommentIds, setPostingCommentIds] = useState(() => new Set());
  const [rejecting, setRejecting] = useState(null);
  const [rejectError, setRejectError] = useState("");
  const [savingReject, setSavingReject] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(null);
  const [namingFolder, setNamingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [creating, setCreating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [version, setVersion] = useState(null); // null = the original set
  const [addingVersion, setAddingVersion] = useState(false);
  const [bin, setBin] = useState(null); // null = closed, [] = open and empty
  const [binBusy, setBinBusy] = useState("");
  // Set when Drive refuses to renew this person's own sign-in (see
  // DRIVE_ACCESS_REQUIRED in lib/googleUserToken.js) - a toast that vanishes
  // in a couple of seconds is the wrong shape for "you need to take an
  // action before anything else here will work", so this gets its own
  // dialog with the fix one tap away instead.
  const [driveAccessIssue, setDriveAccessIssue] = useState("");

  const currentFolder = version ? version.id : trail.length ? trail[trail.length - 1].id : dress.id;
  const atRoot = !version && trail.length === 0;

  // The revision rounds this dress has, newest last. Read from the dress
  // folder's own listing, so they appear the moment one is created in Drive
  // by hand as much as through the button.
  const versions = (rootFiles || [])
    .filter((f) => f.isFolder && dressVersionNumber(f.name) != null)
    .map((f) => ({ ...f, n: dressVersionNumber(f.name) }))
    .sort((a, b) => a.n - b.n);
  const nextVersion = versions.length ? Math.max(...versions.map((v) => v.n)) + 1 : 2;

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
          // Remembered from the dress folder itself, so the version switcher
          // still knows what exists while you are inside V2.
          if (folderId === dress.id) {
            setRootFiles(data.files || []);
            setExtraVersions(data.extraVersions || []);
          }
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
    let accessIssue = false;
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
        // A DRIVE_ACCESS_REQUIRED here means Drive would not renew this
        // person's sign-in (commonly the 7-day refresh-token limit on an
        // app still in Google's "Testing" publishing state) - every
        // remaining file in this batch is doomed the same way, so stop
        // burning through them and surface the actual fix once instead of
        // stacking up N identical failures.
        if (e.code === "DRIVE_ACCESS_REQUIRED") {
          accessIssue = true;
          setDriveAccessIssue(e.message);
          break;
        }
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
      if (!accessIssue) showToast?.(lastError || "Upload failed", "error");
    } else if (failed) {
      showToast?.(`Uploaded ${ok} of ${files.length} - ${failed} failed: ${lastError}`, "error");
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

  /**
   * Starts the next revision round: creates V2 (or V3, V4...) inside the
   * dress and switches straight into it, because the only reason to make one
   * is to put the corrections in it.
   */
  const startVersion = async () => {
    setAddingVersion(true);
    try {
      const res = await driveCreateFolder({
        dressId: dress.id,
        parentId: dress.id,
        name: `V${nextVersion}`,
      });
      const folder = res?.folder || { id: res?.id, name: `V${nextVersion}` };
      setRootFiles((prev) => [...prev, { ...folder, isFolder: true }]);
      setTrail([]);
      setVersion({ id: folder.id, name: `V${nextVersion}`, n: nextVersion });
      showToast?.(`V${nextVersion} created - upload the corrected images here`, "ok");
    } catch (e) {
      showToast?.(e.message || "Could not create that version", "error");
    } finally {
      setAddingVersion(false);
    }
  };

  const createFolder = async (name, clear) => {
    setCreating(true);
    setFolderError("");
    try {
      await driveCreateFolder({ dressId: dress.id, parentId: currentFolder, name });
      clear?.();
      setNamingFolder(false);
      showToast?.(`Created "${name}"`, "ok");
      load(currentFolder);
    } catch (e) {
      // Kept in the dialog rather than fired off as a toast, so the name is
      // still there to correct instead of having to be retyped.
      setFolderError(e.message || "Could not create the folder");
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
  const visibleFiles = state.files.filter((f) => {
    // A version folder is a tab, not a file. Leaving it in the grid meant a
    // dress showed a mystery folder tile next to its images.
    if (f.isFolder && !version && dressVersionNumber(f.name) != null) return false;
    return f.isFolder || matchesFilter(f);
  });

  return (
    <div className="rounded-[14px] border border-border bg-card p-3.5 sm:p-5 mb-5 rise">
      {/* Title and the five actions beside it used to be one flex row that
          only wrapped as a whole - on a phone the actions (download, filter,
          up, bin, refresh) still had to share one un-wrapping line among
          themselves once they landed on their own row, so the last one or
          two ran off the edge and out of reach behind the page's overflow
          guard. Splitting them into their own wrapping group fixes that: the
          title sits on its own line, the actions wrap freely underneath, and
          on sm+ they still sit beside the title exactly as before. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back" title="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h3 className="f-heading font-bold text-base text-foreground truncate">
              {dress.dress}
              {version ? <span className="text-muted-foreground"> / {version.name}</span> : null}
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
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <DownloadMenu dresses={[dress]} showToast={showToast} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs">
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          {/* Labels drop below sm - four buttons' worth of text next to the
              download/filter controls was most of what made this row read
              as clutter on a phone; the icons alone are enough once you
              already know this toolbar (title/tooltip covers a first visit). */}
          {trail.length ? (
            <Button variant="ghost" size="sm" onClick={() => setTrail((t) => t.slice(0, -1))} title="Up a folder">
              <Folder className="size-3.5" /> <span className="hidden sm:inline">Up</span>
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
              <Trash2 className="size-3.5" /> <span className="hidden sm:inline">{bin ? "Hide bin" : "Bin"}</span>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => load(currentFolder)} disabled={loading} title="Refresh">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {versions.length || canWrite ? (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-4 border-b border-border">
          <Layers className="size-3.5 text-muted-foreground" />
          {/* The original is where you land, and it is the only complete set:
              a revision round holds ONLY what was redone, so opening V2 first
              would show three images and hide the other seventeen. */}
          <button
            type="button"
            onClick={() => {
              setVersion(null);
              setTrail([]);
            }}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
              !version
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Original
          </button>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setTrail([]);
                setVersion({ id: v.id, name: v.name, n: v.n });
              }}
              title={`Revision round ${v.n}`}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                version?.id === v.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.name}
            </button>
          ))}
          {canWrite ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={startVersion}
              disabled={addingVersion}
              title={`Create V${nextVersion} for the corrected images`}
            >
              <Plus className="size-3.5" /> {addingVersion ? "Creating" : `New version`}
            </Button>
          ) : null}
          {version ? (
            <span className="text-[11px] text-muted-foreground ml-1">
              Corrections only. The full set is under Original.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* A later reshoot round that already lives as its own sibling "V2"/
          "V3" folder in Drive, one level up from this dress folder rather
          than inside it - a different layout than the Original/V2 tabs
          above, so it opens in Drive itself instead of pretending to be
          another tab of this same view. */}
      {extraVersions.length ? (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-4 border-b border-border text-xs">
          <span className="text-muted-foreground">Also shot as:</span>
          {extraVersions.map((v) => (
            <a
              key={v.folderId}
              href={v.webViewLink || `https://drive.google.com/drive/folders/${v.folderId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens this reshoot round in Google Drive"
              className="font-semibold text-primary hover:underline"
            >
              {v.folderName || `V${v.version}`} ↗
            </a>
          ))}
        </div>
      ) : null}

      {canWrite ? (
        <>
          <Dropzone
            disabled={upload.active}
            uploading={upload.active}
            progress={upload.progress}
            onFiles={onFiles}
            hint={
              trail.length
                ? `They go into ${trail[trail.length - 1].name}.`
                : version
                  ? `They go into ${version.name}, this dress's revision round ${version.n}.`
                  : "They go straight into this dress's Drive folder."
            }
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFolderError("");
                setNamingFolder(true);
              }}
            >
              <FolderPlus className="size-3.5" /> Add folder
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
                Removed - {bin.length} file{bin.length === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {bin.map((f) => (
                  <div key={f.id} className="rounded-[10px] border border-border bg-card overflow-hidden">
                    <div className="aspect-[4/5] bg-secondary grid place-items-center overflow-hidden">
                      {f.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={driveThumbUrl({ fileId: f.id, dressId: dress.id, size: 400 })}
                          alt={f.name}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-2 text-center break-all">
                          {f.name}
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] text-muted-foreground truncate" title={f.name}>
                        {f.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-1.5"
                        onClick={() => recover(f)}
                        disabled={binBusy === f.id}
                        title="Put this file back in the dress"
                      >
                        <Undo2 className="size-3.5" /> {binBusy === f.id ? "Restoring…" : "Recover"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 mt-4">
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

      <PromptDialog
        open={namingFolder}
        title="New folder"
        description={
          atRoot
            ? `Created inside ${dress.dress} in Drive.`
            : `Created inside ${trail[trail.length - 1]?.name || version?.name} in Drive.`
        }
        label="Folder name"
        placeholder="e.g. Selects"
        confirmLabel="Create folder"
        saving={creating}
        error={folderError}
        onSubmit={createFolder}
        onCancel={() => setNamingFolder(false)}
      />
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
        description={`"${confirmTrash?.name || ""}" - it stays in Drive.`}
        confirmLabel="Remove"
        onConfirm={doTrash}
        onCancel={() => setConfirmTrash(null)}
      />
      <ConfirmDialog
        open={Boolean(driveAccessIssue)}
        title="Your Drive sign-in expired"
        description={driveAccessIssue}
        confirmLabel="Sign out now"
        onConfirm={() => signOut()}
        onCancel={() => setDriveAccessIssue("")}
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
