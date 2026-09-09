"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Collects the note for a "feedback" decision — the middle state between
 * approved and rejected, for "close but needs a small tweak" rather than a
 * full rejection. No reason enum like RejectDialog: it is a free note, and
 * it becomes the opening message of that file's comment thread.
 */
export function FeedbackDialog({ open, fileName, saving, error, onSubmit, onCancel }) {
  const [text, setText] = useState("");
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    fieldRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, onCancel]);

  if (!open) return null;

  const canSubmit = text.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={() => !saving && onCancel()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="feedback-title" className="f-heading text-base font-bold text-foreground">
          What should change?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground break-words">{fileName}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Not a rejection — this stays on the board flagged for a small revision.
        </p>

        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. can the sleeve length be adjusted?"
          className="mt-3 w-full rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus-visible:border-primary resize-y"
        />

        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            style={canSubmit ? { background: "var(--warn)", color: "var(--warn-foreground)" } : undefined}
            onClick={() => onSubmit({ text: text.trim() })}
          >
            {saving ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
