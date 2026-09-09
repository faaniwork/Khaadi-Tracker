"use client";

import { useState } from "react";
import { Check, X, Trash2, ExternalLink, Folder, FileText, Loader2 } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { driveThumbUrl } from "@/lib/api";
import { FEEDBACK_REASONS } from "./reject-dialog";

const REASON_LABEL = Object.fromEntries(FEEDBACK_REASONS.map((r) => [r.value, r.label]));

function humanSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * One Drive item in the grid: a folder to open, or a file with its preview
 * and whatever review state it carries.
 *
 * The border does the talking — green for approved, red for rejected — so a
 * client can see where a batch stands without reading a single label.
 */
export function FileTile({
  file,
  dressId,
  review,
  token,
  canWrite,
  canReview,
  busy,
  onOpenFolder,
  onApprove,
  onReject,
  onTrash,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const status = review?.status || "pending";

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

  const borderColor =
    status === "approved"
      ? "var(--good)"
      : status === "rejected"
      ? "var(--destructive)"
      : "var(--border)";

  return (
    <div
      className="rounded-2xl border-2 bg-card overflow-hidden flex flex-col relative"
      style={{ borderColor }}
    >
      <div className="relative aspect-square bg-secondary/60 flex items-center justify-center">
        {file.isImage && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driveThumbUrl({ fileId: file.id, dressId, token })}
            alt={file.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <FileText className="size-7 text-muted-foreground" />
        )}

        {status !== "pending" ? (
          <span
            className="absolute top-2 left-2 f-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: status === "approved" ? "var(--good)" : "var(--destructive)",
              color: status === "approved" ? "var(--good-foreground)" : "var(--destructive-foreground)",
            }}
          >
            {status === "approved" ? "Approved" : "Rejected"}
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

          {file.webViewLink ? (
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

          {canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onTrash?.(file)}
              title="Move to Drive trash"
              aria-label="Move to Drive trash"
              className="size-7 rounded-lg grid place-items-center border border-border text-muted-foreground hover:text-destructive ml-auto disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
