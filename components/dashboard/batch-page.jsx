"use client";

import { useState } from "react";
import { Check, Ban, RefreshCw, Pencil, Plus } from "lucide-react";
import { RELEASE_LINKS, COLLECTION_LINKS, timeAgo } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";
import { DriveIcon } from "@/components/ui/drive-icon";
import { Button } from "@/components/ui/button";
import { BulkStatusControl } from "./status-select";
import { CostInput, CollectionCard, NotesCard } from "./dress-table";
import { DressFiles } from "./files";

export function BatchPage({
  rel,
  releaseDate,
  driveLink,
  rows,
  collections,
  notesForBatch,
  cost,
  canEdit,
  sync,
  expandedCols,
  onToggleCol,
  onFieldChange,
  onRetry,
  onCostChange,
  onCostRetry,
  onBulkStatus,
  onAddNote,
  onRenameCollection,
  onEditBatch,
  onAddCollection,
  onDeleteCollection,
  onRenameDress,
  driveSync,
  onResync,
  resyncing,
  showToast,
}) {
  const [openFiles, setOpenFiles] = useState(null);
  const [editingBatch, setEditingBatch] = useState(false);
  const [addingCollection, setAddingCollection] = useState(false);
  const [batchName, setBatchName] = useState(rel);
  const [batchDate, setBatchDate] = useState(releaseDate || "");
  const [collectionName, setCollectionName] = useState("");
  const [dressCount, setDressCount] = useState(6);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const delivered = rows.filter((r) => r.status === "Delivered").length;
  const discarded = rows.filter((r) => r.status === "Discarded").length;
  const pct = rows.length ? (delivered / rows.length) * 100 : 0;
  const complete = rows.length > 0 && delivered === rows.length;
  const allDiscarded = rows.length > 0 && discarded === rows.length;
  const relLink = driveLink || RELEASE_LINKS[rel];
  const colKeys = Object.keys(collections);

  return (
    <>
      <div
        className="rounded-[14px] border border-border bg-card p-5 mb-5 rise"
        style={allDiscarded ? { borderColor: "var(--destructive)" } : undefined}
      >
        <div className="flex items-start gap-4 flex-wrap">
          <Ring
            pct={allDiscarded ? 100 : pct}
            size={60}
            color={allDiscarded ? "var(--destructive)" : complete ? "var(--good)" : undefined}
            // A blank ring at 0% used to read as a broken avatar rather than
            // as "nothing delivered yet" - "0%" says that plainly, the same
            // way the ring already speaks for every other percentage.
            label={
              allDiscarded ? (
                <Ban className="size-5" style={{ color: "var(--destructive)" }} />
              ) : complete ? (
                <Check className="size-5" style={{ color: "var(--good)" }} />
              ) : undefined
            }
          />
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs text-muted-foreground">
              {colKeys.length} collections · {rows.length} dresses · {delivered} delivered
            </p>
            {releaseDate ? <p className="mt-1 text-xs text-muted-foreground">Delivery date: {releaseDate}</p> : null}
            <div className="mt-2 max-w-[360px]">
              <div className="flex rounded-full overflow-hidden bg-muted" style={{ height: 8 }}>
                {["Delivered", "In Progress", "Needs Revision", "Discarded"].map((s) => {
                  const n = rows.filter((r) => (r.status || "In Progress") === s).length;
                  if (!n) return null;
                  const colorMap = {
                    Delivered: "var(--good)",
                    "In Progress": "var(--info)",
                    "Needs Revision": "var(--warn)",
                    "Not Started": "var(--muted-foreground)",
                    Discarded: "var(--destructive)",
                  };
                  return (
                    <div
                      key={s}
                      title={`${s}: ${n}`}
                      style={{ width: `${(n / rows.length) * 100}%`, background: colorMap[s] }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit ? (
              <button type="button" onClick={() => { setEditingBatch((value) => !value); setFormError(""); }} className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-bold flex items-center gap-1.5">
                <Pencil className="size-3.5" /> Edit batch
              </button>
            ) : null}
            <BulkStatusControl disabled={!canEdit} onPick={(status) => onBulkStatus("release", rel, status, rows.length)} />
            <CostInput
              scope="release"
              keyName={rel}
              value={cost}
              syncState={sync[`cost:release:${rel}`] || "idle"}
              disabled={!canEdit}
              onChange={onCostChange}
              onRetry={() => onCostRetry("release", rel)}
            />
            {/* Drive is where the team manages files, not somewhere a
                viewer or client should ever need to go. */}
            {relLink && canEdit ? (
              <a
                href={relLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this batch in Google Drive"
                aria-label="Open this batch in Google Drive"
                className="rounded-xl bg-secondary border border-border text-foreground px-2.5 py-2 flex items-center font-bold"
              >
                <DriveIcon className="size-4" />
              </a>
            ) : null}
            {canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResync?.(rel)}
                disabled={resyncing}
                title="Read this batch's Drive folder and update names, counts and which folders still count as dresses"
              >
                <RefreshCw className={`size-3.5 ${resyncing ? "animate-spin" : ""}`} />
                {resyncing ? "Checking Drive…" : "Resync from Drive"}
              </Button>
            ) : null}
          </div>
          {driveSync?.at ? (
            <p className="text-[10.5px] text-muted-foreground basis-full">
              Drive checked {timeAgo(driveSync.at)}
              {driveSync.by ? ` by ${driveSync.by}` : ""}
              {driveSync.summary ? ` - ${driveSync.summary}` : ""}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted-foreground basis-full">
              Never checked against Drive, so names and file counts here may be out of date.
            </p>
          )}
        </div>
      </div>

      {canEdit && editingBatch ? (
        <form className="rounded-[14px] border border-border bg-card p-4 mb-4 flex flex-wrap items-end gap-3" onSubmit={async (event) => {
          event.preventDefault(); setSaving(true); setFormError("");
          try { await onEditBatch(rel, batchName.trim(), batchDate); setEditingBatch(false); }
          catch (error) { setFormError(error.message); }
          finally { setSaving(false); }
        }}>
          <label className="text-xs font-semibold flex flex-col gap-1">Batch name<input value={batchName} onChange={(event) => setBatchName(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" required /></label>
          <label className="text-xs font-semibold flex flex-col gap-1">Delivery date<input type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <Button size="sm" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          {formError ? <p className="basis-full text-xs text-destructive">{formError}</p> : null}
        </form>
      ) : null}

      {canEdit ? (
        <div className="mb-4">
          <button type="button" onClick={() => { setAddingCollection((value) => !value); setFormError(""); }} className="text-xs font-bold text-primary flex items-center gap-1"><Plus className="size-4" /> Add collection</button>
          {addingCollection ? (
            <form className="mt-3 rounded-[14px] border border-border bg-card p-4 flex flex-wrap items-end gap-3" onSubmit={async (event) => {
              event.preventDefault(); setSaving(true); setFormError("");
              try { await onAddCollection(rel, collectionName.trim(), Number(dressCount)); setAddingCollection(false); setCollectionName(""); }
              catch (error) { setFormError(error.message); }
              finally { setSaving(false); }
            }}>
              <label className="text-xs font-semibold flex flex-col gap-1">Collection name<input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" required /></label>
              <label className="text-xs font-semibold flex flex-col gap-1">Dresses<input type="number" min="1" max="60" value={dressCount} onChange={(event) => setDressCount(event.target.value)} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm" required /></label>
              <Button size="sm" disabled={saving}>{saving ? "Creating…" : "Create collection"}</Button>
              {formError ? <p className="basis-full text-xs text-destructive">{formError}</p> : null}
            </form>
          ) : null}
        </div>
      ) : null}

      {openFiles ? (
        <DressFiles
          // Same reason as BatchPage's key: DressFiles keeps the opened
          // subfolder trail in state, and carrying that to a different dress
          // would list a folder belonging to the previous one.
          key={openFiles.id}
          dress={openFiles}
          canWrite={canEdit}
          showToast={showToast}
          onClose={() => setOpenFiles(null)}
        />
      ) : null}

      <NotesCard rel={rel} list={notesForBatch} canEdit={canEdit} onAddNote={onAddNote} />

      {colKeys.map((col) => {
        const key = `${rel}␟${col}`;
        return (
          <CollectionCard
            key={key}
            rel={rel}
            col={col}
            colRows={collections[col]}
            isOpen={expandedCols.has(key)}
            onToggle={() => onToggleCol(key)}
            colLink={COLLECTION_LINKS[col]}
            canEdit={canEdit}
            sync={sync}
            onFieldChange={onFieldChange}
            onRetry={onRetry}
            onBulkStatus={onBulkStatus}
            onRenameCollection={onRenameCollection}
            onDeleteCollection={onDeleteCollection}
            canDelete={colKeys.length > 1}
            onRenameDress={onRenameDress}
            onOpenFiles={setOpenFiles}
          />
        );
      })}
    </>
  );
}
