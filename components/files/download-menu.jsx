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
    <select
      value=""
      disabled={disabled || busy || !dresses?.length}
      title="Download files from here"
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = "";
        if (v) run(v);
      }}
      className={`rounded-xl border border-border bg-secondary text-foreground text-xs px-3 py-2 font-bold cursor-pointer outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center gap-1.5 ${className}`}
    >
      <option value="" disabled>
        {busy ? "Downloading…" : "⬇ Download"}
      </option>
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
