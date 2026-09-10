import { useState } from "react";
import { Coins, Pencil, Check, X, Images } from "lucide-react";
import { DriveIcon } from "@/components/ui/drive-icon";
import { timeAgo } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SyncDot } from "@/components/ui/sync-dot";
import { StatusSelect, BulkStatusControl } from "./status-select";

export function CostInput({ scope, keyName, value, syncState, disabled, onChange, onRetry }) {
  return (
    <label className="flex items-center gap-1.5 f-mono text-xs px-2 py-1.5 rounded-lg border border-border bg-secondary/60 text-muted-foreground">
      <SyncDot state={syncState} onRetry={onRetry} title="Saved" />
      <Coins className="size-3.5" />
      {/* Shows blank rather than a literal 0 when no credits have been
          recorded, so an untouched pill reads as empty instead of as a
          number someone entered. */}
      <input
        type="number"
        min="0"
        step="1"
        value={value ? String(value) : ""}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(scope, keyName, e.target.value)}
        className="bg-transparent border-0 outline-none w-14 font-semibold text-foreground placeholder:text-muted-foreground/50 placeholder:font-normal disabled:opacity-60"
      />
    </label>
  );
}

export function DressRow({ row, disabled, syncState, onFieldChange, onRetry, onOpenFiles }) {
  const discarded = row.status === "Discarded";
  return (
    <tr className="dress-row border-b border-border last:border-0">
      <td className={`py-3 px-4 text-sm font-semibold text-foreground ${discarded ? "line-through opacity-50" : ""}`}>
        <SyncDot state={syncState} onRetry={onRetry} title="Saved" />
        {row.dress}
      </td>
      <td className="py-3 px-4">
        <StatusSelect
          value={row.status || "Not Started"}
          disabled={disabled}
          onChange={(v) => onFieldChange(row.id, "status", v)}
        />
      </td>
      {/* The file count doubles as the way into the dress's Drive folder,
          since "how many files" and "which files" are the same question. */}
      <td className="py-3 px-4 whitespace-nowrap">
        <button
          type="button"
          onClick={() => onOpenFiles?.(row)}
          title="Browse this dress's Drive folder"
          className="f-mono text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-secondary transition-colors"
        >
          <Images className="size-3.5" />
          {row.files != null ? row.files : "—"} files
        </button>
      </td>
      <td className="py-3 px-4">
        <input
          type="text"
          defaultValue={row.comments}
          disabled={disabled}
          placeholder="Add a note…"
          onBlur={(e) => onFieldChange(row.id, "comments", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="rounded-[10px] border border-border bg-secondary/60 px-2.5 py-1.5 text-sm w-full min-w-[140px] outline-none focus-visible:border-primary disabled:opacity-60"
        />
        {row.updatedBy ? (
          <div className="text-[10.5px] mt-1 text-muted-foreground">
            by {row.updatedBy} · {timeAgo(row.updatedAt)}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function CollectionCard({
  rel,
  col,
  colRows,
  isOpen,
  onToggle,
  colLink,
  canEdit,
  sync,
  onFieldChange,
  onRetry,
  onBulkStatus,
  onRenameCollection,
  onOpenFiles,
}) {
  const delivered = colRows.filter((r) => r.status === "Delivered").length;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(col);
  const [saving, setSaving] = useState(false);

  const startRename = (e) => {
    e.stopPropagation();
    setDraft(col);
    setRenaming(true);
  };
  const cancelRename = (e) => {
    e?.stopPropagation();
    setRenaming(false);
  };
  const submitRename = async (e) => {
    e?.stopPropagation();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === col) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await onRenameCollection(rel, col, trimmed);
      setRenaming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-border bg-card mb-3 overflow-hidden rise">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 flex-wrap bg-secondary/40">
        <button
          type="button"
          onClick={onToggle}
          className="size-7 rounded-lg flex items-center justify-center shrink-0 bg-secondary text-muted-foreground"
          aria-expanded={isOpen}
        >
          <span
            className="inline-block transition-transform duration-150"
            style={{ transform: `rotate(${isOpen ? 90 : 0}deg)` }}
          >
            ›
          </span>
        </button>
        <div className="min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={draft}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(e);
                  if (e.key === "Escape") cancelRename(e);
                }}
                className="rounded-lg border border-primary bg-card px-2 py-1 text-sm font-bold text-foreground outline-none w-40"
              />
              <button
                type="button"
                onClick={submitRename}
                disabled={saving}
                className="size-6 rounded-md flex items-center justify-center text-good disabled:opacity-50"
                style={{ color: "var(--good)" }}
                aria-label="Save name"
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelRename}
                disabled={saving}
                className="size-6 rounded-md flex items-center justify-center text-muted-foreground disabled:opacity-50"
                aria-label="Cancel rename"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm truncate text-foreground">{col}</h3>
              {canEdit ? (
                <button
                  type="button"
                  onClick={startRename}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Rename this collection"
                  aria-label="Rename this collection"
                >
                  <Pencil className="size-3" />
                </button>
              ) : null}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {colRows.length} dress{colRows.length === 1 ? "" : "es"} · {delivered} delivered
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <BulkStatusControl disabled={!canEdit} onPick={(status) => onBulkStatus("collection", `${rel}␟${col}`, status, colRows.length)} />
          {colLink ? (
            <a
              href={colLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this collection in Google Drive"
              aria-label="Open this collection in Google Drive"
              className="rounded-xl bg-secondary border border-border text-foreground px-2 py-1.5 flex items-center"
            >
              <DriveIcon className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      {isOpen ? (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Dress", "Status", "Files", "Comments"].map((h) => (
                  <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide px-4 py-2 text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colRows.map((r) => (
                <DressRow
                  key={r.id}
                  row={r}
                  disabled={!canEdit}
                  syncState={sync[`row:${r.id}`] || "idle"}
                  onFieldChange={onFieldChange}
                  onRetry={() => onRetry(r.id)}
                  onOpenFiles={onOpenFiles}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function NotesCard({ rel, list, canEdit, onAddNote }) {
  const items = (list || []).slice().reverse();
  return (
    <div className="rounded-[14px] border border-border bg-card p-5 mb-5 rise">
      <h3 className="f-heading font-bold text-sm mb-2 text-foreground">Notes on this batch</h3>
      <div className="mb-3">
        {items.length ? (
          items.map((n) => (
            <div key={n.id} className="flex gap-3 py-2.5 border-b border-border last:border-0 last:pb-0">
              <div className="size-7 rounded-full flex items-center justify-center f-mono text-[10px] font-bold shrink-0 bg-primary/15 text-primary">
                {(n.by || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">{n.by || "Someone"}</span>
                  <span className="text-[10.5px] text-muted-foreground">{timeAgo(n.at)}</span>
                </div>
                <p className="text-sm mt-0.5 break-words text-muted-foreground">{n.text}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm py-1 text-muted-foreground">
            No notes yet — add context on delays, revisions or cancellations below.
          </p>
        )}
      </div>
      <form
        className="flex gap-2 items-center flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.noteText;
          const text = input.value.trim();
          if (!text) return;
          onAddNote(rel, text);
          input.value = "";
        }}
      >
        <Input
          name="noteText"
          type="text"
          disabled={!canEdit}
          placeholder="Add a note — e.g. why a piece was cancelled…"
          className="flex-1 min-w-[200px]"
        />
        <Button type="submit" size="sm" disabled={!canEdit}>
          Add note
        </Button>
      </form>
    </div>
  );
}
