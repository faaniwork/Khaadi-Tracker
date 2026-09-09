"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export const FEEDBACK_REASONS = [
  { value: "accuracy", label: "Accuracy", hint: "Garment, colour or detail is wrong" },
  { value: "pose", label: "Pose", hint: "Body, hands or angle is off" },
];

/**
 * Collects the reason for a rejection.
 *
 * A rejection without a reason is close to useless to whoever has to fix the
 * image, so a reason is always required; the note below it is where any
 * detail beyond the reason goes; there is deliberately no third "something
 * else" reason that just duplicated what that note already covers.
 */
export function RejectDialog({ open, fileName, saving, error, onSubmit, onCancel }) {
  const [reason, setReason] = useState("accuracy");
  const [text, setText] = useState("");
  const firstRef = useRef(null);

  // No effect resets this form between files. Callers pass a `key` tied to
  // the file being rejected, so React unmounts and remounts the dialog and
  // the fields start empty on their own.
  //
  // `saving` is a real dependency: re-binding the listener when it flips is
  // cheap, and it keeps Escape from closing the dialog mid-submit.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    firstRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, onCancel]);

  if (!open) return null;

  const canSubmit = Boolean(reason) && !saving;

  // Portalled onto <body> — an animated ancestor (the dress card's `rise`
  // entrance) creates a containing block for position:fixed, which would
  // otherwise centre this within that card's box instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={() => !saving && onCancel()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="reject-title" className="f-heading text-base font-bold text-foreground">
          What needs changing?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground break-words">{fileName}</p>

        <div className="mt-4">
          {FEEDBACK_REASONS.map((r, i) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 py-2.5 cursor-pointer ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="reject-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className={`block text-sm ${reason === r.value ? "font-bold text-foreground" : "font-semibold text-foreground/80"}`}>
                  {r.label}
                </span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Anything to add? (optional)"
          className="mt-1 w-full border-b border-border bg-transparent px-0.5 py-2 text-sm outline-none focus-visible:border-primary resize-y"
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
            variant="destructive"
            size="sm"
            disabled={!canSubmit}
            onClick={() => onSubmit({ reason, feedbackText: text.trim() })}
          >
            {saving ? "Sending…" : "Reject"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
