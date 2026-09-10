"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Asks for one short piece of text.
 *
 * Exists because an input sitting permanently beside its own button is a
 * form nobody asked for: it takes up room on every visit for something used
 * occasionally, and it is unclear which button the field belongs to. A button
 * that opens a prompt is one thing at rest and one question when pressed.
 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  confirmLabel = "Create",
  saving,
  error,
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    // Focused on open, so it can be typed into without reaching for a mouse.
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, saving]);

  if (!open) return null;

  const submit = () => {
    const clean = value.trim();
    if (!clean || saving) return;
    onSubmit(clean, () => setValue(""));
  };

  // Portalled onto <body> for the same reason every dialog here is: rendered
  // inline it would be trapped inside a `rise`-animated card, whose transform
  // creates a containing block for anything fixed inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={saving ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="prompt-title" className="f-heading text-base font-bold text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
        <label className="block mt-4">
          {label ? (
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
          ) : null}
          <Input
            ref={inputRef}
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={placeholder}
            className="w-full mt-1.5"
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !value.trim()}>
            {saving ? "Creating" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
