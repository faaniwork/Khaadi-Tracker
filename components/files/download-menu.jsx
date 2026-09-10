"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
 * or a whole batch; the caller decides scope by what it passes in.
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
  const isDisabled = disabled || busy || !dresses?.length;
  const run = async (mode) => {
    setBusy(true);
    try {
      await downloadForDresses({ dresses, mode, showToast });
    } finally {
      setBusy(false);
    }
  };

  return (
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
  );
}
