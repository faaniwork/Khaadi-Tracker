"use client";

import { useState } from "react";
import { Folder, Check, Ban, RefreshCw } from "lucide-react";
import { RELEASE_LINKS, COLLECTION_LINKS, timeAgo } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";
import { Button } from "@/components/ui/button";
import { BulkStatusControl } from "./status-select";
import { CostInput, CollectionCard, NotesCard } from "./dress-table";
import { DressFiles } from "./files";

export function BatchPage({
  rel,
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
  driveSync,
  onResync,
  resyncing,
  showToast,
}) {
  const [openFiles, setOpenFiles] = useState(null);
  if (!rows.length) {
    return (
      <>
        <div className="rounded-[20px] border border-border bg-card p-8 text-center text-sm mb-5 text-muted-foreground">
          Nothing in this batch yet.
        </div>
        <NotesCard rel={rel} list={notesForBatch} canEdit={canEdit} onAddNote={onAddNote} />
      </>
    );
  }
  const delivered = rows.filter((r) => r.status === "Delivered").length;
  const discarded = rows.filter((r) => r.status === "Discarded").length;
  const pct = rows.length ? (delivered / rows.length) * 100 : 0;
  const complete = rows.length > 0 && delivered === rows.length;
  const allDiscarded = rows.length > 0 && discarded === rows.length;
  const relLink = RELEASE_LINKS[rel];
  const colKeys = Object.keys(collections);

  return (
    <>
      <div
        className="rounded-[20px] border border-border bg-card p-5 mb-5 rise"
        style={allDiscarded ? { borderColor: "var(--destructive)" } : undefined}
      >
        <div className="flex items-start gap-4 flex-wrap">
          <Ring
            pct={allDiscarded ? 100 : pct}
            size={60}
            color={allDiscarded ? "var(--destructive)" : complete ? "var(--good)" : undefined}
            label={
              allDiscarded ? (
                <Ban className="size-5" style={{ color: "var(--destructive)" }} />
              ) : complete ? (
                <Check className="size-5" style={{ color: "var(--good)" }} />
              ) : Math.round(pct) ? (
                undefined
              ) : (
                ""
              )
            }
          />
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs text-muted-foreground">
              {colKeys.length} collections · {rows.length} dresses · {delivered} delivered
            </p>
            <div className="mt-2 max-w-[360px]">
              <div className="flex rounded-full overflow-hidden bg-muted" style={{ height: 8 }}>
                {["Delivered", "In Progress", "Needs Revision", "Not Started", "Discarded"].map((s) => {
                  const n = rows.filter((r) => (r.status || "Not Started") === s).length;
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
            {relLink ? (
              <a
                href={relLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-secondary border border-border text-foreground text-xs px-3 py-2 flex items-center gap-1.5 font-bold"
              >
                <Folder className="size-3.5" /> Folder
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
              {driveSync.summary ? ` — ${driveSync.summary}` : ""}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted-foreground basis-full">
              Never checked against Drive, so names and file counts here may be out of date.
            </p>
          )}
        </div>
      </div>

      {openFiles ? (
        <DressFiles
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
            onOpenFiles={setOpenFiles}
          />
        );
      })}
    </>
  );
}
