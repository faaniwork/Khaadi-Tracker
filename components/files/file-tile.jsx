"use client";

import { useState } from "react";
import { Check, X, MessageCircle, Trash2, ExternalLink, Folder, FileText, Loader2, Send } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { driveThumbUrl } from "@/lib/api";
import { FEEDBACK_REASONS } from "./reject-dialog";

const REASON_LABEL = Object.fromEntries(FEEDBACK_REASONS.map((r) => [r.value, r.label]));

const STATUS_STYLE = {
  approved: { label: "Approved", color: "var(--good)", fg: "var(--good-foreground)" },
  feedback: { label: "Feedback", color: "var(--warn)", fg: "var(--warn-foreground)" },
  rejected: { label: "Rejected", color: "var(--destructive)", fg: "var(--destructive-foreground)" },
};

function humanSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CommentThread({ comments, canComment, posting, onAdd }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };
  return (
    <div className="mt-1 pt-2 border-t border-border flex flex-col gap-1.5">
      {comments.length ? (
        <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto scrollbar-thin">
          {comments.map((c) => (
            <div key={c.id} className="text-[11px] leading-snug">
              <span className="font-bold text-foreground">{c.by}</span>{" "}
              <span className="text-muted-foreground">· {timeAgo(c.at)}</span>
              <p className="text-foreground/90 break-words">{c.text}</p>
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
            className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/60 px-2 py-1 text-[11px] outline-none focus-visible:border-primary disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={posting || !draft.trim()}
            aria-label="Send comment"
            className="size-6 rounded-md grid place-items-center text-primary disabled:opacity-40"
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
 * The border does the talking — green for approved, amber for feedback, red
 * for rejected — so a client can see where a batch stands without reading a
 * single label.
 */
export function FileTile({
  file,
  dressId,
  review,
  comments,
  canWrite,
  canReview,
  busy,
  postingComment,
  onOpenFolder,
  onOpenLightbox,
  onApprove,
  onFeedback,
  onReject,
  onTrash,
  onAddComment,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const status = review?.status || "pending";
  const commentList = comments || [];

  if (file.isFolder) {
    return (
      <button
        type="button"
        onClick={() => onOpenFolder?.(file)}
        className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center justify-center gap-2 aspect-square hover:border-primary transition-colors"
      >
        <Folder className="size-7 text-muted-foreground" />
        <span className="text-xs font-bold text-foreground text-center break-words line-clamp-2">
          {file.name}
        </span>
      </button>
    );
  }

  const statusStyle = STATUS_STYLE[status];

  return (
    <div
      className="rounded-2xl border-2 bg-card overflow-hidden flex flex-col relative"
      style={{ borderColor: statusStyle?.color || "var(--border)" }}
    >
      <div className="relative aspect-square bg-secondary/60 flex items-center justify-center overflow-hidden">
        {file.isImage && !imgFailed ? (
          <button
            type="button"
            onClick={() => onOpenLightbox?.(file)}
            aria-label={`View ${file.name} full screen`}
            className="absolute inset-0 size-full group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={driveThumbUrl({ fileId: file.id, dressId })}
              alt={file.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 size-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
            />
          </button>
        ) : (
          <FileText className="size-7 text-muted-foreground" />
        )}

        {statusStyle ? (
          <span
            className="absolute top-2 left-2 f-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: statusStyle.color, color: statusStyle.fg }}
          >
            {statusStyle.label}
          </span>
        ) : null}

        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-card/60">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </span>
        ) : null}
      </div>

      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground break-words line-clamp-2">{file.name}</p>
          <p className="f-mono text-[10px] text-muted-foreground">
            {humanSize(file.size)}
            {file.modifiedTime ? ` · ${timeAgo(file.modifiedTime)}` : ""}
          </p>
        </div>

        {status === "rejected" && review?.reason ? (
          <p className="text-[11px] leading-snug" style={{ color: "var(--destructive)" }}>
            <span className="font-bold">{REASON_LABEL[review.reason] || review.reason}</span>
            {review.text ? ` — ${review.text}` : ""}
          </p>
        ) : status === "feedback" && review?.text ? (
          <p className="text-[11px] leading-snug" style={{ color: "var(--warn-foreground)" }}>
            {review.text}
          </p>
        ) : null}

        {review?.by ? (
          <p className="text-[10px] text-muted-foreground">
            {review.by} · {timeAgo(review.at)}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-1.5 flex-wrap">
          {canReview ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove?.(file)}
                title={status === "approved" ? "Approved — click to clear" : "Approve"}
                aria-label="Approve"
                className="size-7 rounded-lg grid place-items-center border transition-colors disabled:opacity-50"
                style={
                  status === "approved"
                    ? { background: "var(--good)", color: "var(--good-foreground)", borderColor: "var(--good)" }
                    : { borderColor: "var(--border)", color: "var(--good)" }
                }
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onFeedback?.(file)}
                title={status === "feedback" ? "Has feedback — click to change the note" : "Leave feedback"}
                aria-label="Leave feedback"
                className="size-7 rounded-lg grid place-items-center border transition-colors disabled:opacity-50"
                style={
                  status === "feedback"
                    ? { background: "var(--warn)", color: "var(--warn-foreground)", borderColor: "var(--warn)" }
                    : { borderColor: "var(--border)", color: "var(--warn)" }
                }
              >
                <MessageCircle className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReject?.(file)}
                title={status === "rejected" ? "Rejected — click to change the reason" : "Reject"}
                aria-label="Reject"
                className="size-7 rounded-lg grid place-items-center border transition-colors disabled:opacity-50"
                style={
                  status === "rejected"
                    ? {
                        background: "var(--destructive)",
                        color: "var(--destructive-foreground)",
                        borderColor: "var(--destructive)",
                      }
                    : { borderColor: "var(--border)", color: "var(--destructive)" }
                }
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : null}

          {/* Drive is where the team manages files, not where a client
              should ever need to go — this stays admin/editor only. */}
          {file.webViewLink && canWrite ? (
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Drive"
              aria-label="Open in Drive"
              className="size-7 rounded-lg grid place-items-center border border-border text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            title="Comments"
            aria-label="Comments"
            className={`h-7 px-2 rounded-lg grid grid-flow-col items-center gap-1 border text-[11px] font-bold ml-auto ${
              showComments ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <MessageCircle className="size-3.5" /> {commentList.length || ""}
          </button>

          {canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onTrash?.(file)}
              title="Move to Drive trash"
              aria-label="Move to Drive trash"
              className="size-7 rounded-lg grid place-items-center border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
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
