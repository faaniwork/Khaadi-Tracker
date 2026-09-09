"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export const FEEDBACK_REASONS = [
  { value: "accuracy", label: "Accuracy", hint: "Garment, colour or detail is wrong" },
  { value: "pose", label: "Pose", hint: "Body, hands or angle is off" },
  { value: "other", label: "Something else", hint: "Tell us in a line" },
];

/**
 * Collects the reason for a rejection.
 *
 * A rejection without a reason is close to useless to whoever has to fix the
 * image, so the reason is required, and picking "Something else" requires the
 * note that makes it actionable. The submit button stays disabled until
 * there is enough to act on rather than failing after the click.
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

  const needsText = reason === "other";
  const canSubmit = Boolean(reason) && (!needsText || text.trim().length > 0) && !saving;

  // Portalled onto <body> — see the same note in feedback-dialog.jsx: this
  // would otherwise be trapped inside the dress card's animated `rise`
  // wrapper instead of centering on the actual viewport.
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

        <div className="mt-4 flex flex-col gap-2">
          {FEEDBACK_REASONS.map((r, i) => (
            <label
              key={r.value}
              className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                reason === r.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"
              }`}
            >
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="reject-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {needsText ? (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What's wrong with this one?"
            className="mt-3 w-full rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus-visible:border-primary resize-y"
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Anything to add? (optional)"
            className="mt-3 w-full rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus-visible:border-primary resize-y"
          />
        )}

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
            {saving ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
