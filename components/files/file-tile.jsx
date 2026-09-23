"use client";

import { useState } from "react";
import { Check, X, MessageCircle, Trash2, Folder, FileText, Loader2, Send, CircleCheck, Circle } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { driveThumbUrl } from "@/lib/api";
import { DriveIcon } from "@/components/ui/drive-icon";
import { FEEDBACK_REASONS } from "./reject-dialog";

const REASON_LABEL = Object.fromEntries(FEEDBACK_REASONS.map((r) => [r.value, r.label]));

const STATUS_STYLE = {
  approved: { label: "Approved", color: "var(--good)", fg: "var(--good-foreground)" },
  rejected: { label: "Rejected", color: "var(--destructive)", fg: "var(--destructive-foreground)" },
};
// A comment thread is the "needs a look" signal, not a status of its own —
// it can sit on an approved file just as easily as a pending one. It only
// takes over the border/badge when there is no stronger decision already.
const COMMENTED_STYLE = { label: "Comments", color: "var(--warn)", fg: "var(--warn-foreground)" };

function humanSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Matches NotesCard's own list style elsewhere in the dashboard: plain rows
// separated by a hairline, an initials mark instead of an avatar image, no
// filled panel around the thread. One visual language for "a list of short
// messages from people", not a different one per feature.
function CommentThread({ comments, canComment, posting, onAdd }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };
  return (
    <div className="pt-2.5 border-t border-border flex flex-col gap-2">
      {comments.length ? (
        <div className="flex flex-col max-h-32 overflow-y-auto scrollbar-thin">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 py-1.5 border-b border-border last:border-0">
              <div className="size-5 rounded-full flex items-center justify-center f-mono text-[9px] font-bold shrink-0 bg-primary/15 text-primary">
                {(c.by || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-snug">
                  <span className="font-bold text-foreground">{c.by}</span>{" "}
                  <span className="text-muted-foreground">{timeAgo(c.at)}</span>
                </p>
                <p className="text-xs text-foreground/85 break-words">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No comments yet.</p>
      )}
      {canComment ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Add a comment…"
            disabled={posting}
            className="flex-1 min-w-0 border-b border-border bg-transparent px-0.5 py-1 text-[11px] outline-none focus-visible:border-primary disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={posting || !draft.trim()}
            aria-label="Send comment"
            className="text-primary disabled:opacity-40 disabled:cursor-default"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One Drive item in the grid: a folder to open, or a file with its preview
 * and whatever review state it carries.
 *
 * The border does the talking — green for approved, amber for an unresolved
 * comment, red for rejected — so a client can see where a batch stands
 * without reading a single label. Controls below the image are bare icons
 * with colour, not boxes around boxes: the photo is the content here, and
 * the chrome should stay out of its way.
 */
export function FileTile({
  file,
  dressId,
  // A local object URL for a file this browser just uploaded. Drive takes a
  // little while to generate a thumbnail for brand new content, so straight
  // after an upload its own thumbnail URL is a blank square - which is
  // exactly the moment someone is watching to see their picture arrive.
  // The bytes are already here, so show those instead.
  previewSrc,
  // Bulk-select mode: while active, the tile's own click toggles selection
  // instead of opening the lightbox, and a checkmark takes over the corner
  // that the approve/reject badge normally owns (the two never show at
  // once, so there is no real estate fight).
  selectable,
  selected,
  onToggleSelect,
  review,
  comments,
  canWrite,
  canReview,
  busy,
  postingComment,
  onOpenFolder,
  onOpenLightbox,
  onApprove,
  onReject,
  onTrash,
  onAddComment,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const status = review?.status || "pending";
  const commentList = comments || [];
  const hasComments = commentList.length > 0;

  if (file.isFolder) {
    return (
      <button
        type="button"
        disabled={selectable}
        onClick={() => onOpenFolder?.(file)}
        className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center justify-center gap-2 aspect-square hover:border-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        <Folder className="size-7 text-muted-foreground" />
        <span className="text-xs font-bold text-foreground text-center break-words line-clamp-2">
          {file.name}
        </span>
      </button>
    );
  }

  // A real decision (approved/rejected) always wins the border. Short of
  // that, an unresolved comment thread is what earns the amber "look at
  // this" treatment.
  const statusStyle = STATUS_STYLE[status] || (hasComments ? COMMENTED_STYLE : null);

  return (
    <div
      className="rounded-2xl border bg-card overflow-hidden flex flex-col relative"
      style={{
        borderColor: selected ? "var(--primary)" : statusStyle?.color || "var(--border)",
        borderWidth: selected || statusStyle ? 2 : 1,
      }}
    >
      {/* 2:3, not square: these are shot vertical-portrait at 2:3, so a
          square crop was cutting real frame off the top and bottom of
          every photo in the grid - exactly the part a client reviewing a
          garment needs to see. object-cover now has nothing to crop since
          the frame already matches the photo's own ratio. */}
      <div className="relative aspect-[2/3] bg-secondary/60 flex items-center justify-center overflow-hidden">
        {file.isImage && !imgFailed ? (
          <button
            type="button"
            onClick={() => (selectable ? onToggleSelect?.(file) : onOpenLightbox?.(file))}
            // Warms the full-resolution image while the cursor is still on
            // its way to the click, so opening it is usually instant. Costs
            // nothing for anyone who never opens it.
            onMouseEnter={() => {
              if (selectable) return;
              const img = new Image();
              img.src = driveThumbUrl({ fileId: file.id, dressId, size: 1600 });
            }}
            aria-label={selectable ? `Select ${file.name}` : `View ${file.name} full screen`}
            aria-pressed={selectable ? selected : undefined}
            className="absolute inset-0 size-full group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc || driveThumbUrl({ fileId: file.id, dressId, v: file.modifiedTime })}
              alt={file.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className={`absolute inset-0 size-full object-cover transition-[transform,opacity] duration-300 ease-out ${
                selectable ? "" : "group-hover:scale-110"
              }`}
              style={selected ? { opacity: 0.85 } : undefined}
            />
          </button>
        ) : (
          <FileText className="size-7 text-muted-foreground" />
        )}

        {selectable ? (
          <span
            className="absolute top-2 left-2 size-6 rounded-full grid place-items-center shadow-sm pointer-events-none"
            style={{
              background: selected ? "var(--primary)" : "rgba(0,0,0,0.35)",
              color: selected ? "var(--primary-foreground)" : "#fff",
            }}
          >
            {selected ? <CircleCheck className="size-4" /> : <Circle className="size-4" />}
          </span>
        ) : statusStyle ? (
          <span
            className="absolute top-2 left-2 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm"
            style={{ background: statusStyle.color, color: statusStyle.fg }}
          >
            {statusStyle.label}
          </span>
        ) : null}

        {hasComments ? (
          <span
            className="absolute top-2 right-2 size-5 rounded-full grid place-items-center f-mono text-[9px] font-bold shadow-sm"
            style={{ background: "var(--warn)", color: "var(--warn-foreground)" }}
            title={`${commentList.length} comment${commentList.length === 1 ? "" : "s"}`}
          >
            {commentList.length}
          </span>
        ) : null}

        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-card/60">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </span>
        ) : null}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground break-words line-clamp-1" title={file.name}>
            {file.name}
          </p>
          <p className="f-mono text-[10px] text-muted-foreground mt-0.5">
            {humanSize(file.size)}
            {file.modifiedTime ? ` · ${timeAgo(file.modifiedTime)}` : ""}
            {review?.by ? ` · ${review.by}` : ""}
          </p>
        </div>

        {status === "rejected" && review?.reason ? (
          <p className="text-[11px] leading-snug border-l-2 pl-2" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
            <span className="font-bold">{REASON_LABEL[review.reason] || review.reason}</span>
            {review.text ? ` - ${review.text}` : ""}
          </p>
        ) : null}

        <div className={`mt-auto flex items-center flex-wrap gap-x-2 gap-y-1.5 ${selectable ? "opacity-40 pointer-events-none" : ""}`}>
          {canReview ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove?.(file)}
                title={status === "approved" ? "Approved - click to clear" : "Approve"}
                aria-label="Approve"
                className="p-1.5 -m-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                style={{ color: status === "approved" ? "var(--good)" : "var(--muted-foreground)" }}
              >
                <Check className="size-[18px]" strokeWidth={status === "approved" ? 3 : 2} />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReject?.(file)}
                title={status === "rejected" ? "Rejected - click to change the reason" : "Reject"}
                aria-label="Reject"
                className="p-1.5 -m-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                style={{ color: status === "rejected" ? "var(--destructive)" : "var(--muted-foreground)" }}
              >
                <X className="size-[18px]" strokeWidth={status === "rejected" ? 3 : 2} />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            aria-label="Comments"
            className="flex items-center gap-1 p-1.5 -m-1 rounded-lg hover:bg-secondary transition-colors ml-auto"
            style={{ color: showComments ? "var(--primary)" : hasComments ? "var(--warn)" : "var(--muted-foreground)" }}
          >
            <MessageCircle className="size-4" strokeWidth={showComments || hasComments ? 2.5 : 2} />
            {commentList.length ? <span className="text-[11px] font-bold">{commentList.length}</span> : null}
          </button>

          {/* Drive is where the team manages files, not where a client
              should ever need to go - this stays admin/editor only. */}
          {file.webViewLink && canWrite ? (
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Drive"
              aria-label="Open in Drive"
              className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <DriveIcon className="size-4" />
            </a>
          ) : null}

          {canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onTrash?.(file)}
              title="Move to Drive trash"
              aria-label="Move to Drive trash"
              className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>

        {showComments ? (
          <CommentThread
            comments={commentList}
            canComment={canReview}
            posting={postingComment}
            onAdd={(text) => onAddComment?.(file, text)}
          />
        ) : null}
      </div>
    </div>
  );
}
