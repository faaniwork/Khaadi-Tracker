"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "You have uploaded some of these before."
 *
 * Matching is on the filename the picture had on the uploader's own machine,
 * which Drive keeps as originalFilename (see FILE_FIELDS in lib/drive.js).
 * It cannot be the name in Drive: every upload is renamed to its position in
 * the set on the way in - D2-V1-P7.jpg - so by the time a file is in Drive
 * there is nothing left of what it was called when it was dropped, and two
 * completely different pictures happily end up with sequential names.
 *
 * One decision for the whole overlapping set rather than a prompt per file:
 * these arrive twenty and thirty at a time out of the same export folder, so
 * anyone answering the same question thirty times is going to hold the
 * button down and stop reading it. The files are listed so the decision is
 * still an informed one.
 *
 * Three answers, because there are genuinely three intents:
 *   Replace - "this is the corrected version of that picture"
 *   Skip    - "I re-dropped the whole folder, just add what's new"
 *   Cancel  - "that's the wrong folder entirely"
 */
export function DuplicateDialog({ open, duplicates, freshCount, onReplace, onSkip, onCancel }) {
  if (!open) return null;
  const n = duplicates.length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dupe-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[14px] border border-border bg-card p-5 rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="size-9 shrink-0 rounded-[10px] grid place-items-center bg-secondary">
            <Copy className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h3 id="dupe-title" className="f-heading font-bold text-base text-foreground">
              {n} {n === 1 ? "picture is" : "pictures are"} already here
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {freshCount
                ? `The other ${freshCount} ${freshCount === 1 ? "is" : "are"} new and will upload either way.`
                : "Everything in this drop has been uploaded before."}
            </p>
          </div>
        </div>

        <ul className="mt-3.5 max-h-40 overflow-y-auto scrollbar-thin rounded-[10px] border border-border bg-secondary/40 divide-y divide-border">
          {duplicates.map((d) => (
            <li key={d.name} className="px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-foreground truncate" title={d.name}>
                {d.name}
              </span>
              <span className="ml-auto shrink-0 f-mono text-[10px] text-muted-foreground" title="Its name in Drive">
                {d.existing.name}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button onClick={onReplace}>Replace {n === 1 ? "it" : "them"}</Button>
          <Button variant="ghost" onClick={onSkip}>
            {freshCount ? "Skip, upload the rest" : "Skip"}
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Replacing keeps each picture&rsquo;s place and its comments, and clears its
          approved or rejected mark so it gets looked at again.
        </p>
      </div>
    </div>
  );
}
