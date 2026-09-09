"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { driveThumbUrl } from "@/lib/api";

const LIGHTBOX_SIZE = 2000;

/**
 * Fullscreen viewer for one image in a dress's file grid, opened by clicking
 * a thumbnail. Everything happens here rather than in Drive itself — that is
 * the point of it existing.
 *
 * Zoom is click-to-toggle (1x / 2.5x) rather than a slider, since a client
 * squinting at stitching detail just wants "bigger", not a control panel.
 * Arrow keys / on-screen arrows move to the next or previous file in the
 * same list, skipping folders, so a rejection reason doesn't force a trip
 * back to the grid to see the next image.
 */
export function Lightbox({ files, dressId, index, onClose, onIndexChange }) {
  // Tracks WHICH index is zoomed rather than a plain boolean, so moving to a
  // different image resets the zoom for free — index changing on navigation
  // is what un-zooms it, with no effect needed to watch for that.
  const [zoomedIndex, setZoomedIndex] = useState(null);
  const zoomed = zoomedIndex === index;
  const containerRef = useRef(null);

  const images = (files || []).filter((f) => !f.isFolder && f.isImage);
  const file = images[index];

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

  if (!file) return null;

  // Portalled straight onto <body>. Rendered inline it would sit inside the
  // dress card's `rise` entrance animation, and an animated transform on an
  // ancestor — even one that settles on translateY(0) — creates a containing
  // block for `position: fixed`, which would trap this at the card's size
  // instead of covering the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center select-none"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/90" onClick={onClose} aria-hidden="true" />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 size-10 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="size-5" />
      </button>

      <button
        type="button"
        onClick={() => setZoomedIndex((z) => (z === index ? null : index))}
        aria-label={zoomed ? "Zoom out" : "Zoom in"}
        className="absolute top-4 left-4 z-10 size-10 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        {zoomed ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
      </button>

      {index > 0 ? (
        <button
          type="button"
          onClick={() => onIndexChange((i) => Math.max(0, i - 1))}
          aria-label="Previous image"
          className="absolute left-3 sm:left-6 z-10 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}
      {index < images.length - 1 ? (
        <button
          type="button"
          onClick={() => onIndexChange((i) => Math.min(images.length - 1, i + 1))}
          aria-label="Next image"
          className="absolute right-3 sm:right-6 z-10 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      <div
        ref={containerRef}
        className={`relative max-w-[92vw] max-h-[86vh] overflow-auto rounded-lg ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onClick={() => setZoomedIndex((z) => (z === index ? null : index))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={driveThumbUrl({ fileId: file.id, dressId, size: LIGHTBOX_SIZE })}
          alt={file.name}
          className="block transition-transform duration-200 ease-out"
          style={{
            maxWidth: zoomed ? "none" : "92vw",
            maxHeight: zoomed ? "none" : "86vh",
            width: zoomed ? "180%" : "auto",
          }}
        />
      </div>

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70 f-mono">
        {file.name} · {index + 1} / {images.length}
      </p>
    </div>,
    document.body
  );
}
