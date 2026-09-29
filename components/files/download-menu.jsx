"use client";

import { useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { downloadForDresses } from "@/lib/bulkDownload";

const OPTIONS = [
  { value: "all", label: "Download all" },
  { value: "approved", label: "Download approved" },
  { value: "approved_or_commented", label: "Download approved + feedback" },
];

/**
 * One dropdown, three presets, same reset-after-pick pattern as
 * BulkStatusControl elsewhere in this dashboard — a native select rather
 * than a custom popover, so this needs no click-outside handling of its
 * own. Works the same whether `dresses` is one dress, a whole collection,
 * or a whole collection; the caller decides scope by what it passes in.
 *
 * The select itself is invisible, not styled: a native select's own closed
 * -state text box ignores text-align on several mobile browsers, which is
 * how this used to end up as an off-centre "⬇" character instead of a
 * proper icon. A real lucide Download icon sits on top instead, painted
 * from a sibling div rather than the select's own text, so it is always
 * dead centre and looks like every other icon button in this app instead
 * of an emoji standing in for one.
 */
export function DownloadMenu({ dresses, showToast, disabled, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const isDisabled = disabled || busy || !dresses?.length;
  const run = async (mode) => {
    setBusy(true);
    setProgress({ phase: 'preparing', message: 'Preparing download…' });
    try {
      let fileHandle;
      if (typeof window.showSaveFilePicker === "function") {
        try {
          const label = dresses.length === 1 ? dresses[0].dress : dresses[0].collection;
          fileHandle = await window.showSaveFilePicker({
            suggestedName: `${String(label || "khaadi-download").replace(/[\\/]/g, "-")}.zip`,
            types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
          });
        } catch (error) {
          if (error.name === "AbortError") return;
          // Browsers can expose the picker but disable it in this context.
        }
      }
      await downloadForDresses({ dresses, mode, showToast: setProgress, fileHandle });
    } finally {
      setBusy(false);
      setProgress((current) => current?.phase === 'complete' || current?.phase === 'error' ? current : null);
    }
  };

  const dismissProgress = () => {
    if (!busy) setProgress(null);
  };

  return (
    <>
      <div className={`relative inline-flex size-9 shrink-0 ${className}`}>
        <select
        value=""
        disabled={isDisabled}
        title="Download"
        aria-label="Download"
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) run(v);
        }}
        className="peer absolute inset-0 size-full appearance-none rounded-full bg-transparent text-transparent cursor-pointer outline-none disabled:cursor-not-allowed"
      >
        <option value="" disabled>
          Download
        </option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-full border border-border bg-secondary text-foreground transition-colors peer-focus-visible:border-primary ${isDisabled ? "opacity-60" : ""}`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </div>
      </div>
      {progress ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-5 md:left-auto md:right-5 md:w-[min(26rem,calc(100vw-2rem))] z-[60] rounded-2xl border border-border bg-card p-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            {busy ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{progress.message}</p>
              {busy ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progress.progress || 3}%` }}
                  />
                </div>
              ) : null}
            </div>
            {!busy ? (
              <button type="button" onClick={dismissProgress} aria-label="Dismiss download status" className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
