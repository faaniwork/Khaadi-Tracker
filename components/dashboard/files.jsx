"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowLeft,
  FolderPlus,
  RefreshCw,
  Loader2,
  Folder,
  FileText,
  Trash2,
  Undo2,
  Layers,
  Plus,
  CheckSquare,
  X as XIcon,
  Check,
  Images,
} from "lucide-react";
import {
  driveList,
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
import { DuplicateDialog } from "@/components/files/duplicate-dialog";
import { useUploads } from "@/components/upload-manager";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { Lightbox } from "@/components/files/lightbox";
import { DownloadMenu } from "@/components/files/download-menu";

// Stable across renders on purpose: handed out whenever the current folder
// doesn't match the folder a selection was made in, so a `.has()` check
// against it consistently comes back empty instead of allocating a fresh
// Set every render.
const EMPTY_SET = new Set();

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "commented", label: "Has comments" },
  { value: "rejected", label: "Rejected" },
];

/**
 * A picture that is on its way up, shown in the grid alongside the ones that
 * have landed.
 *
 * The image is the local file itself, so it is on screen the instant it is
 * dropped - no round trip, nothing to wait for. It sits at reduced opacity
 * with its progress underneath until Drive confirms it, at which point the
 * real tile takes its place.
 */
function PendingTile({ item }) {
  const failed = item.status === "error";
  return (
    <div
      className="rounded-2xl border bg-card overflow-hidden flex flex-col relative"
      style={{ borderColor: failed ? "var(--destructive)" : "var(--border)" }}
    >
      {/* Matches the real tile's 2:3 frame (see file-tile.jsx) so a photo
          doesn't visibly resize the instant it finishes uploading and
          swaps from this preview to the real one. */}
      <div className="relative aspect-[2/3] bg-secondary/60 grid place-items-center overflow-hidden">
        {item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.previewUrl}
            alt={item.name}
            className="absolute inset-0 size-full object-cover"
            style={{ opacity: failed ? 0.35 : 0.6 }}
          />
        ) : (
          <FileText className="size-7 text-muted-foreground" />
        )}
        {failed ? (
          <span
            className="absolute top-2 left-2 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm"
            style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}
          >
            Failed
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </span>
        )}
        {item.replaceFileId && !failed ? (
          <span className="absolute top-2 left-2 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm bg-foreground text-background">
            Replacing
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="text-[11px] text-muted-foreground truncate" title={item.name}>
          {item.name}
        </p>
        {failed ? (
          <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--destructive)" }}>
            {item.error}
          </p>
        ) : (
          <div className="mt-1.5 rounded-full bg-muted overflow-hidden" style={{ height: 4 }}>
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.round((item.progress || 0) * 100)}%`,
                background: "var(--primary)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

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
  // The queue itself lives above this component so an upload outlives the
  // screen that started it - see components/upload-manager.jsx.
  const { enqueue, itemsFor, clearFinished } = useUploads();
  // A drop that overlaps what is already in the folder, parked here until
  // someone answers replace / skip / cancel.
  const [pendingDrop, setPendingDrop] = useState(null);
  // Bulk selection: a folder's worth of tiles turned into checkboxes so a
  // handful of pictures can be approved, rejected or removed together
  // instead of one tap per photo per file.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Which folder the selection above belongs to, so it can be scoped to
  // that folder by comparison at render time (see below) rather than by an
  // effect racing the grid to catch up after a navigation.
  const [selectionFolder, setSelectionFolder] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkTrash, setConfirmBulkTrash] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkRejectError, setBulkRejectError] = useState("");
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
  // Set once someone dismisses the current access-error message, so it does
  // not reopen the dialog on every render while the same failure sits in the
  // upload queue (see driveAccessIssue below).
  const [dismissedAccessError, setDismissedAccessError] = useState("");

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

  // A selection is scoped to the folder it was made in - opening a version
  // tab or stepping into a subfolder with three photos still ticked would
  // let "Delete" reach files nobody looking at this screen can even see.
  // Compared at render time rather than reset by an effect, so there is no
  // frame where the OLD folder's selection paints against the NEW folder's
  // grid before an effect catches up.
  const isSelecting = selecting && selectionFolder === currentFolder;
  const activeSelectedIds = isSelecting ? selectedIds : EMPTY_SET;

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

  /**
   * What is in this folder already, keyed by the name it had on the machine
   * it was uploaded from.
   *
   * It has to be that name, not the name in Drive: every upload is renamed
   * to its position in the set on the way in (D2-V1-P7.jpg), so two
   * unrelated pictures reliably end up with neighbouring names while the
   * same picture uploaded twice ends up with two different ones.
   *
   * Files that predate Drive being told to record it report their Drive name
   * instead, and are skipped - so the worst this does on old folders is fail
   * to notice a duplicate, never invent one.
   */
  const existingByOriginalName = () => {
    const map = new Map();
    mergedFiles.forEach((f) => {
      if (f.isFolder || !f.originalFilename || f.originalFilename === f.name) return;
      map.set(f.originalFilename.toLowerCase(), f);
    });
    return map;
  };

  const startUpload = (files, replaceFileIds) => {
    // Last batch's finished rows go now rather than on completion, so the
    // "12 uploaded" summary is still on screen until the next drop.
    clearFinished(currentFolder);
    enqueue({
      dressId: dress.id,
      folderId: currentFolder,
      folderLabel: version?.name || trail[trail.length - 1]?.name || dress.dress,
      files,
      replaceFileIds,
    });
  };

  const onFiles = (files) => {
    const existingNames = existingByOriginalName();
    const duplicates = [];
    const fresh = [];
    files.forEach((file) => {
      const existing = existingNames.get(String(file.name).toLowerCase());
      if (existing) duplicates.push({ name: file.name, file, existing });
      else fresh.push(file);
    });
    if (!duplicates.length) {
      startUpload(files);
      return;
    }
    setPendingDrop({ duplicates, fresh });
  };

  const resolveDrop = (choice) => {
    const drop = pendingDrop;
    setPendingDrop(null);
    if (!drop || choice === "cancel") return;
    if (choice === "skip") {
      if (drop.fresh.length) startUpload(drop.fresh);
      else showToast?.("Nothing new to upload", "ok");
      return;
    }
    const replaceFileIds = {};
    drop.duplicates.forEach((d) => {
      replaceFileIds[d.name] = d.existing.id;
    });
    startUpload([...drop.fresh, ...drop.duplicates.map((d) => d.file)], replaceFileIds);
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

  // ---- bulk selection ----

  const toggleSelect = (file) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const doBulkTrash = async () => {
    const ids = Array.from(selectedIds);
    setConfirmBulkTrash(false);
    setBulkBusy(true);
    // Fired together rather than one at a time - each of these is its own
    // small server round trip, and waiting for twenty of them in sequence is
    // exactly the kind of delay bulk actions exist to avoid.
    const results = await Promise.allSettled(
      ids.map((id) => driveTrashFile({ dressId: dress.id, fileId: id }))
    );
    const okIds = ids.filter((_, i) => results[i].status === "fulfilled");
    setState((s) => ({ ...s, files: s.files.filter((f) => !okIds.includes(f.id)) }));
    const failed = results.length - okIds.length;
    if (failed) {
      showToast?.(`Removed ${okIds.length} of ${ids.length} - ${failed} failed`, "error");
    } else {
      showToast?.(`Removed ${okIds.length} file${okIds.length === 1 ? "" : "s"}`, "ok");
    }
    setBulkBusy(false);
    exitSelecting();
  };

  const doBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    const results = await Promise.allSettled(
      ids.map((id) => {
        const f = state.files.find((x) => x.id === id);
        return driveReview({ dressId: dress.id, fileId: id, fileName: f?.name || "", decision: "approved" });
      })
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") setReviewLocal(ids[i], r.value.review);
    });
    const failed = results.filter((r) => r.status === "rejected").length;
    showToast?.(
      failed ? `Approved ${ids.length - failed} of ${ids.length} - ${failed} failed` : `Approved ${ids.length} file${ids.length === 1 ? "" : "s"}`,
      failed ? "error" : "ok"
    );
    setBulkBusy(false);
    if (results.some((r) => r.status === "fulfilled" && r.value?.moved)) load(currentFolder);
    exitSelecting();
  };

  const submitBulkReject = async ({ reason, feedbackText }) => {
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    setBulkRejectError("");
    const results = await Promise.allSettled(
      ids.map((id) => {
        const f = state.files.find((x) => x.id === id);
        return driveReview({
          dressId: dress.id,
          fileId: id,
          fileName: f?.name || "",
          decision: "rejected",
          reason,
          feedbackText,
        });
      })
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") setReviewLocal(ids[i], r.value.review);
    });
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkBusy(false);
    setBulkRejecting(false);
    if (failed) {
      showToast?.(`Rejected ${ids.length - failed} of ${ids.length} - ${failed} failed`, "error");
    } else {
      showToast?.(`Rejected ${ids.length} file${ids.length === 1 ? "" : "s"}`, "ok");
    }
    load(currentFolder);
    exitSelecting();
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

  // ---- uploads landing in this folder, right now ----
  //
  // Each finished upload is folded into the listing the moment it lands
  // instead of waiting for the whole batch and then refetching: a drop of
  // thirty photos used to show a progress bar and an unchanged empty grid
  // for minutes, which reads as nothing happening at all. A file that is
  // replacing an existing one carries the same Drive id, so it overwrites
  // that entry rather than appearing twice.
  const folderUploads = itemsFor(currentFolder);
  const inFlight = folderUploads.filter((u) => u.status !== "done" && u.status !== "cancelled");
  const doneUploads = folderUploads.filter((u) => u.status === "done" && u.result);
  // Drive needs a moment to generate a thumbnail for brand new content, so
  // until the next listing the tile shows the bytes this browser still has.
  const previewById = new Map(doneUploads.map((u) => [u.result.id, u.previewUrl]));

  const mergedFiles = (() => {
    if (!doneUploads.length) return state.files;
    const byId = new Map(state.files.map((f) => [f.id, f]));
    doneUploads.forEach((u) => byId.set(u.result.id, { ...(byId.get(u.result.id) || {}), ...u.result }));
    return Array.from(byId.values());
  })();

  // One reconciling refetch once the folder goes quiet, for the things a
  // locally merged file cannot know: its review row, and where Drive's own
  // ordering actually puts it.
  const activeUploadCount = folderUploads.filter(
    (u) => u.status === "queued" || u.status === "uploading"
  ).length;
  const wasUploading = useRef(0);
  useEffect(() => {
    if (wasUploading.current > 0 && activeUploadCount === 0) load(currentFolder);
    wasUploading.current = activeUploadCount;
  }, [activeUploadCount, currentFolder, load]);

  // An expired Drive sign-in is the one upload failure that needs its own
  // dialog rather than an error tile: nothing else here will work until it
  // is dealt with, and the fix is one tap away. Read straight off the queue
  // rather than copied into state by an effect - the queue already holds it,
  // and all this screen has to remember is whether it was waved away.
  const accessError = folderUploads.find((u) => u.code === "DRIVE_ACCESS_REQUIRED")?.error || "";
  const driveAccessIssue = dismissedAccessError === accessError ? "" : accessError;

  const matchesFilter = (f) => {
    if (!statusFilter) return true;
    if (statusFilter === "commented") return (state.comments[f.id] || []).length > 0;
    return (state.reviews[f.id]?.status || "pending") === statusFilter;
  };
  const visibleFiles = mergedFiles.filter((f) => {
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
              {dress.collection} · {mergedFiles.filter((f) => !f.isFolder).length} file
              {mergedFiles.filter((f) => !f.isFolder).length === 1 ? "" : "s"}
              {counts.approved ? ` · ${counts.approved} approved` : ""}
              {commentedCount ? ` · ${commentedCount} commented` : ""}
              {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <DownloadMenu dresses={[dress]} showToast={showToast} />
          {/* One tap into the same swipeable full-screen viewer every tile
              already opens on click - like tapping straight into a photo's
              own single view in Photos rather than having to find one tile
              in the grid first. Available to anyone who can see files at
              all, review permission or not - it's a way to look, not to
              act. */}
          {visibleFiles.some((f) => !f.isFolder && f.isImage) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const images = visibleFiles.filter((x) => !x.isFolder && x.isImage);
                if (images.length) setLightboxIndex(0);
              }}
              title="Browse full-screen, swipe or use the arrow keys to move between photos"
            >
              <Images className="size-3.5" /> <span className="hidden sm:inline">Browse</span>
            </Button>
          ) : null}
          {(reviewAllowed || canWrite) && visibleFiles.some((f) => !f.isFolder) ? (
            <Button
              variant={isSelecting ? "primary" : "ghost"}
              size="sm"
              onClick={() => {
                if (isSelecting) {
                  exitSelecting();
                } else {
                  setSelectionFolder(currentFolder);
                  setSelectedIds(new Set());
                  setSelecting(true);
                }
              }}
              title="Select multiple files to approve, reject or remove together"
            >
              <CheckSquare className="size-3.5" /> <span className="hidden sm:inline">{isSelecting ? "Cancel" : "Select"}</span>
            </Button>
          ) : null}
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

      {isSelecting ? (
        <div className="flex items-center gap-2 flex-wrap mb-4 -mt-1 rounded-[10px] border border-border bg-secondary/50 px-3 py-2">
          <span className="text-xs font-bold text-foreground">
            {activeSelectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() =>
              setSelectedIds((prev) => {
                const selectableIds = visibleFiles.filter((f) => !f.isFolder).map((f) => f.id);
                return prev.size === selectableIds.length ? new Set() : new Set(selectableIds);
              })
            }
            className="text-xs font-semibold text-primary hover:underline"
          >
            {activeSelectedIds.size === visibleFiles.filter((f) => !f.isFolder).length ? "Deselect all" : "Select all"}
          </button>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {reviewAllowed ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!activeSelectedIds.size || bulkBusy}
                  onClick={doBulkApprove}
                  title="Approve selected"
                >
                  <Check className="size-3.5" style={{ color: "var(--good)" }} />{" "}
                  <span className="hidden sm:inline">Approve</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!activeSelectedIds.size || bulkBusy}
                  onClick={() => {
                    setBulkRejectError("");
                    setBulkRejecting(true);
                  }}
                  title="Reject selected, with one reason for all of them"
                >
                  <XIcon className="size-3.5" style={{ color: "var(--destructive)" }} />{" "}
                  <span className="hidden sm:inline">Reject</span>
                </Button>
              </>
            ) : null}
            {canWrite ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={!activeSelectedIds.size || bulkBusy}
                onClick={() => setConfirmBulkTrash(true)}
                title="Remove selected"
              >
                <Trash2 className="size-3.5" /> <span className="hidden sm:inline">Remove</span>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

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
            // Never disabled while uploading any more. The queue takes
            // whatever is dropped on it and works through it in order, so
            // there is no reason to make someone wait for one batch to
            // finish before adding the next.
            uploadingCount={activeUploadCount}
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
                    <div className="aspect-[2/3] bg-secondary grid place-items-center overflow-hidden">
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
      ) : !visibleFiles.length && !inFlight.length && !state.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {mergedFiles.length ? "No files match that filter." : "Nothing in this folder yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 mt-4">
          {/* Queued and in-progress files get a tile of their own, drawn from
              the picture on this machine. Waiting for Drive to confirm each
              one before anything appeared is what made a big drop look like
              nothing was happening. */}
          {inFlight.map((u) => (
            <PendingTile key={u.id} item={u} />
          ))}
          {visibleFiles.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              dressId={dress.id}
              previewSrc={previewById.get(f.id)}
              selectable={isSelecting && !f.isFolder}
              selected={activeSelectedIds.has(f.id)}
              onToggleSelect={toggleSelect}
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
        open={confirmBulkTrash}
        title={`Remove ${selectedIds.size} file${selectedIds.size === 1 ? "" : "s"}?`}
        description="They stay in Drive."
        confirmLabel={bulkBusy ? "Removing…" : "Remove"}
        onConfirm={doBulkTrash}
        onCancel={() => setConfirmBulkTrash(false)}
      />
      <RejectDialog
        key={bulkRejecting ? Array.from(selectedIds).join(",") : "none"}
        open={bulkRejecting}
        fileName={`${selectedIds.size} file${selectedIds.size === 1 ? "" : "s"}`}
        saving={bulkBusy}
        error={bulkRejectError}
        onSubmit={submitBulkReject}
        onCancel={() => setBulkRejecting(false)}
      />
      <DuplicateDialog
        open={Boolean(pendingDrop)}
        duplicates={pendingDrop?.duplicates || []}
        freshCount={pendingDrop?.fresh.length || 0}
        onReplace={() => resolveDrop("replace")}
        onSkip={() => resolveDrop("skip")}
        onCancel={() => resolveDrop("cancel")}
      />
      <ConfirmDialog
        open={Boolean(driveAccessIssue)}
        title="Your Drive sign-in expired"
        description={driveAccessIssue}
        confirmLabel="Sign out now"
        onConfirm={() => signOut()}
        onCancel={() => setDismissedAccessError(accessError)}
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
