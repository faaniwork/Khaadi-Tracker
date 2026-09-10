"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The batch name a date implies — "September 16 Release".
 *
 * Only ever a starting point: the existing batches are named every which way
 * ("Sept 9 Release", "2 Sep Release", "Release Aug 19"), so the field stays
 * editable rather than pretending there is one true convention. It does stop
 * being auto-filled once it has been edited by hand.
 */
function nameForDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${MONTHS[m - 1]} ${d} Release`;
}

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DRESS_PRESETS = [4, 6, 8, 10, 12];

/**
 * Builds a batch's folder tree in Drive: the batch folder, a folder per
 * collection, and a run of empty dress folders in each ready for images.
 *
 * The dress count is presets plus a free number rather than presets alone,
 * because "8 or 10 or whatever" in practice includes the whatever.
 */
export function NewBatchDialog({ open, onClose, onCreate }) {
  const [date, setDate] = useState(todayIso);
  const [name, setName] = useState(() => nameForDate(todayIso()));
  const [nameEdited, setNameEdited] = useState(false);
  const [collections, setCollections] = useState([{ name: "", dresses: 6 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const setDateAndName = (iso) => {
    setDate(iso);
    if (!nameEdited) setName(nameForDate(iso));
  };

  const patch = (i, changes) =>
    setCollections((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...changes } : c)));

  const totalDresses = collections.reduce((n, c) => n + (Number(c.dresses) || 0), 0);
  const ready =
    name.trim() &&
    collections.length > 0 &&
    collections.every((c) => c.name.trim() && Number(c.dresses) >= 1);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        date,
        collections: collections.map((c) => ({ name: c.name.trim(), dresses: Number(c.dresses) })),
      });
    } catch (e) {
      setError(e.message || "Could not create that batch");
    } finally {
      setBusy(false);
    }
  };

  // Portalled onto <body> for the same reason every other dialog here is:
  // it would otherwise be trapped inside a `rise`-animated card and centre on
  // that instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-batch-title"
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="new-batch-title" className="f-heading text-base font-bold text-foreground">
          Add a batch
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates the folders in Drive, ready for images.
        </p>

        <div className="mt-4 flex gap-3 flex-wrap">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Date</span>
            <Input
              type="date"
              value={date}
              disabled={busy}
              onChange={(e) => setDateAndName(e.target.value)}
              className="w-[160px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-xs font-semibold text-muted-foreground">Folder name</span>
            <Input
              value={name}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              placeholder="September 16 Release"
            />
          </label>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Collections</span>
            <span className="f-mono text-[11px] text-muted-foreground">
              {totalDresses} dress{totalDresses === 1 ? "" : "es"} total
            </span>
          </div>

          {collections.map((c, i) => (
            <div key={i} className="flex items-end gap-2 mt-3 flex-wrap">
              <label className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <Input
                  value={c.name}
                  disabled={busy}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder="e.g. 1-26-350"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Dresses</span>
                <div className="flex items-center gap-1">
                  {DRESS_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      onClick={() => patch(i, { dresses: n })}
                      className={`f-mono text-xs rounded-lg px-2 py-2 border transition-colors ${
                        Number(c.dresses) === n
                          ? "border-transparent bg-primary text-primary-foreground font-bold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={c.dresses}
                    disabled={busy}
                    onChange={(e) => patch(i, { dresses: e.target.value.replace(/\D/g, "") })}
                    className="w-[62px] f-mono text-xs"
                    aria-label="How many dresses"
                  />
                </div>
              </label>
              {collections.length > 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCollections((prev) => prev.filter((_, idx) => idx !== i))}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove this collection"
                  aria-label="Remove this collection"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={() => setCollections((prev) => [...prev, { name: "", dresses: 6 }])}
          >
            <Plus className="size-3.5" /> Add collection
          </Button>
        </div>

        {error ? (
          <p className="mt-4 text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy || !ready}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {busy ? "Creating folders…" : "Create in Drive"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
