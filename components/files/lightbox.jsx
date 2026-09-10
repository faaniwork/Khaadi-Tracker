"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MessageCircle, X as XIcon, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { driveThumbUrl } from "@/lib/api";

const LIGHTBOX_SIZE = 1600;
const GRID_SIZE = 600; // matches the grid thumbnail, so it is already cached
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const CLICK_ZOOM = 2.5;

const STATUS_LABEL = {
  approved: { label: "Approved", color: "var(--good)", fg: "var(--good-foreground)" },
  rejected: { label: "Rejected", color: "var(--destructive)", fg: "var(--destructive-foreground)" },
};
const COMMENTED_LABEL = { label: "Comments", color: "var(--warn)", fg: "var(--warn-foreground)" };

/**
 * The actual image, as two stacked layers: the grid's own 600px thumbnail
 * (already in the browser cache almost every time, since it is the same URL
 * the grid just rendered) shows immediately, and the full-resolution image
 * fades in over it once it arrives. Keyed by file id from the caller, so
 * switching images remounts this fresh and the loaded-state resets on its
 * own — no effect needed to watch the index and reset anything.
 */
function LightboxImage({ file, dressId, scale, onZoomBy, onToggleZoom }) {
  const [loaded, setLoaded] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const zoomed = scale > 1;
  // Derived, not reset by an effect: at 1x the pan is simply ignored, so
  // zooming back out re-centres for free and the image can never be left
  // parked off-screen with no way to bring it back.
  const offset = zoomed ? pan : { x: 0, y: 0 };

  // The wheel listener is attached by hand, non-passive, because React
  // registers `wheel` as PASSIVE at its root — which makes
  // event.preventDefault() inside an onWheel prop a silent no-op. That is
  // the entire reason scrolling over the image used to scroll the page
  // behind it: the zoom was working, the scroll was never being cancelled.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      // A mouse wheel reports deltaY in ~100 steps; a trackpad reports many
      // small ones, and a pinch arrives as a wheel event with ctrlKey set.
      // Pinch gets a coarser factor because its deltas are tiny.
      onZoomBy(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomBy]);

  const onPointerDown = (e) => {
    if (!zoomed) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, fromX: pan.x, fromY: pan.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setPan({ x: d.fromX + dx, y: d.fromY + dy });
  };

  const imgStyle = {
    maxWidth: "92vw",
    maxHeight: "80vh",
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
  };

  return (
    <div
      ref={frameRef}
      className={`relative max-w-[92vw] max-h-full overflow-hidden rounded-lg touch-none ${
        zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        // A drag that panned the image must not also count as the click that
        // toggles zoom, or panning would zoom straight back out.
        const moved = dragRef.current?.moved;
        dragRef.current = null;
        if (!moved) onToggleZoom();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={driveThumbUrl({ fileId: file.id, dressId, size: GRID_SIZE })}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="block"
        style={{ ...imgStyle, display: loaded ? "none" : "block", filter: "blur(1px)" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={driveThumbUrl({ fileId: file.id, dressId, size: LIGHTBOX_SIZE })}
        alt={file.name}
        onLoad={() => setLoaded(true)}
        draggable={false}
        fetchPriority="high"
        decoding="async"
        className="block"
        style={{ ...imgStyle, display: loaded ? "block" : "none" }}
      />
    </div>
  );
}

/**
 * Fullscreen viewer for one image in a dress's file grid, opened by clicking
 * a thumbnail. Everything happens here rather than in Drive itself, review
 * decisions included — that is the point of it existing.
 *
 * Laid out in three fixed bands (top bar / image / bottom bar) rather than
 * overlaying controls on the image, so a review button is never sitting on
 * top of the thing being reviewed.
 */
export function Lightbox({
  files,
  dressId,
  index,
  reviews,
  comments,
  canReview,
  busyIds,
  postingCommentIds,
  onClose,
  onIndexChange,
  onApprove,
  onReject,
  onAddComment,
}) {
  // {index, scale} rather than a plain per-lightbox scale, so moving to a
  // different image resets the zoom for free: once index no longer matches,
  // the effective scale falls back to 1 with no effect needed to reset it.
  const [zoomState, setZoomState] = useState({ index: null, scale: 1 });
  const [commentDraft, setCommentDraft] = useState("");
  const scale = zoomState.index === index ? zoomState.scale : 1;
  const setScale = (next) =>
    setZoomState((z) => {
      const current = z.index === index ? z.scale : 1;
      const value = typeof next === "function" ? next(current) : next;
      return { index, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) };
    });

  const images = (files || []).filter((f) => !f.isFolder && f.isImage);
  const file = images[index];
  const review = file ? reviews?.[file.id] : null;
  const status = review?.status || "pending";
  const fileComments = (file && comments?.[file.id]) || [];
  const statusStyle = STATUS_LABEL[status] || (fileComments.length ? COMMENTED_LABEL : null);
  const busy = file ? busyIds?.has(file.id) : false;
  const postingComment = file ? postingCommentIds?.has(file.id) : false;

  // Pure side effect on the browser's own image cache, no state involved:
  // by the time someone presses "next", the image is often already there.
  useEffect(() => {
    [images[index - 1], images[index + 1]].forEach((neighbour) => {
      if (!neighbour) return;
      const img = new Image();
      img.src = driveThumbUrl({ fileId: neighbour.id, dressId, size: LIGHTBOX_SIZE });
    });
  }, [index, images, dressId]);

  // Belt and braces with the wheel handler above: while this is open the
  // page behind it does not scroll at all, by keyboard or scrollbar either.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange((i) => Math.min(images.length - 1, i + 1));
      if (e.key === "ArrowLeft") onIndexChange((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // images.length is stable for the life of one open lightbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onIndexChange]);

  const onZoomBy = useCallback((delta) => {
    setZoomState((z) => {
      const current = z.index === index ? z.scale : 1;
      return { index, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta)) };
    });
  }, [index]);

  if (!file) return null;

  const sendComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    onAddComment?.(file, text);
    setCommentDraft("");
  };
  // Portalled straight onto <body>. Rendered inline it would sit inside the
  // dress card's `rise` entrance animation, and an animated transform on an
  // ancestor — even one that settles on translateY(0) — creates a containing
  // block for `position: fixed`, which would trap this at the card's size
  // instead of covering the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col select-none bg-black/95"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar: never shrinks, so it never eats into the image band below. */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="size-9 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <XIcon className="size-4.5" />
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => (s > 1 ? 1 : CLICK_ZOOM))}
          aria-label={scale > 1 ? "Zoom out" : "Zoom in"}
          className="size-9 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          {scale > 1 ? <ZoomOut className="size-4.5" /> : <ZoomIn className="size-4.5" />}
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="f-mono text-sm font-bold text-white">
            {index + 1} / {images.length}
          </p>
          <p className="text-xs text-white/60 truncate">{file.name}</p>
        </div>
        {statusStyle ? (
          <span
            className="f-mono text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: statusStyle.color, color: statusStyle.fg }}
          >
            {statusStyle.label}
          </span>
        ) : (
          <span className="w-[62px] shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Image band: the only flexible region, so the bars above and below
          always stay clear of it regardless of image aspect ratio. */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-3">
        {index > 0 ? (
          <button
            type="button"
            onClick={() => onIndexChange((i) => Math.max(0, i - 1))}
            aria-label="Previous image"
            className="absolute left-2 sm:left-4 z-10 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        {index < images.length - 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange((i) => Math.min(images.length - 1, i + 1))}
            aria-label="Next image"
            className="absolute right-2 sm:right-4 z-10 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="size-6" />
          </button>
        ) : null}

        <LightboxImage
          key={file.id}
          file={file}
          dressId={dressId}
          scale={scale}
          onZoomBy={onZoomBy}
          onToggleZoom={() => setScale((s) => (s > 1 ? 1 : CLICK_ZOOM))}
        />
      </div>

      {/* Bottom bar: never shrinks either, and sits below the image band —
          reviewing an image never means covering it to do so. */}
      <div className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-3">
        {status === "rejected" && review?.text ? (
          <p className="text-xs text-center mb-2" style={{ color: "var(--destructive)" }}>
            {review.text}
          </p>
        ) : null}

        {canReview ? (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove?.(file)}
              className="rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 border transition-colors disabled:opacity-50"
              style={
                status === "approved"
                  ? { background: "var(--good)", color: "var(--good-foreground)", borderColor: "var(--good)" }
                  : { borderColor: "rgba(255,255,255,.2)", color: "var(--good)" }
              }
            >
              <Check className="size-3.5" /> Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject?.(file)}
              className="rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 border transition-colors disabled:opacity-50"
              style={
                status === "rejected"
                  ? {
                      background: "var(--destructive)",
                      color: "var(--destructive-foreground)",
                      borderColor: "var(--destructive)",
                    }
                  : { borderColor: "rgba(255,255,255,.2)", color: "var(--destructive)" }
              }
            >
              <XIcon className="size-3.5" /> Reject
            </button>
          </div>
        ) : null}

        {fileComments.length || canReview ? (
          <div className="max-w-lg mx-auto mt-3">
            {fileComments.length ? (
              <div className="max-h-20 overflow-y-auto scrollbar-thin flex flex-col gap-1 mb-1.5">
                {fileComments.map((c) => (
                  <p key={c.id} className="text-[11px] text-white/80">
                    <span className="font-bold text-white">{c.by}</span>{" "}
                    <span className="text-white/50">· {timeAgo(c.at)}</span> — {c.text}
                  </p>
                ))}
              </div>
            ) : null}
            {canReview ? (
              <div className="flex items-center gap-1.5">
                <MessageCircle className="size-3.5 text-white/50 shrink-0" />
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendComment()}
                  placeholder="Add a comment…"
                  disabled={postingComment}
                  className="flex-1 min-w-0 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 outline-none focus-visible:border-white/50 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={sendComment}
                  disabled={postingComment || !commentDraft.trim()}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white bg-white/15 hover:bg-white/25 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
