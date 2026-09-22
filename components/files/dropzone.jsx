"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

/**
 * Drag-and-drop plus click-to-browse upload target.
 *
 * dragenter/dragleave fire for every child element the pointer crosses, which
 * makes the highlight flicker if you track them as booleans. Counting enters
 * against leaves is what keeps it steady.
 */
export function Dropzone({ disabled, onFiles, uploadingCount = 0, hint }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const inputRef = useRef(null);

  const accept = (list) => {
    const files = Array.from(list || []);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (disabled) return;
        accept(e.dataTransfer?.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
        over ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
      <UploadCloud className="size-6 mx-auto mb-2 text-muted-foreground" />
      {/* Stays a working drop target while an upload is running. The progress
          itself is no longer shown here at all: each picture now carries its
          own progress on its own tile in the grid below, and the app-wide
          pill (see UploadStatusBar) covers the case where someone has walked
          away from this screen entirely. A bar here as well would be the
          same information a third time. */}
      <p className="text-sm font-bold text-foreground">
        Drop files here, or{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-primary underline underline-offset-2 disabled:no-underline"
        >
          browse
        </button>
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {uploadingCount
          ? `${uploadingCount} still uploading - you can keep dropping, they queue up.`
          : hint || "They go straight into this dress's Drive folder."}
      </p>
    </div>
  );
}
