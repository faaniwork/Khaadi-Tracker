"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Portalled onto <body> — see the same note in feedback-dialog.jsx: this
  // would otherwise be trapped inside whatever `rise`-animated card renders
  // it, instead of centering on the actual viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="confirm-title" className="f-heading text-base font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            ref={ref}
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
