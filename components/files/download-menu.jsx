"use client";

import { useState } from "react";
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
 */
export function DownloadMenu({ dresses, showToast, disabled, className = "" }) {
  const [busy, setBusy] = useState(false);
  const run = async (mode) => {
    setBusy(true);
    try {
      await downloadForDresses({ dresses, mode, showToast });
    } finally {
      setBusy(false);
    }
  };

  return (
    // A native select rather than a custom popover (see the file's own
    // note above), which is exactly why this can't show an icon-and-nothing
    // -else the way a real button can - the closed state is always some
    // text. Kept as short as a select can go instead: a bare arrow, no
    // "Download" label repeating what the arrow already says, in a small
    // round footprint that reads as an icon button at a glance.
    <select
      value=""
      disabled={disabled || busy || !dresses?.length}
      title="Download"
      aria-label="Download"
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = "";
        if (v) run(v);
      }}
      className={`appearance-none size-9 shrink-0 rounded-full border border-border bg-secondary text-foreground text-sm font-bold cursor-pointer outline-none text-center focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <option value="" disabled>
        {busy ? "…" : "⬇"}
      </option>
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
