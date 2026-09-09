"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Layers, Shirt, Images } from "lucide-react";
import { sortReleasesByRecency, STATUS_OPTIONS } from "@/lib/constants";
import { Select } from "@/components/ui/input";
import { DressFiles } from "./files";

/**
 * The client-facing side of the board: batches → collections → dresses →
 * images, with nothing else on it. No credits, no revisions, no status
 * dropdowns, no Drive links — those are dashboard concerns for the team.
 *
 * Opening a dress goes straight to its images. There is no extra "click to
 * see 24 files" step in between; DressFiles is rendered already expanded.
 * Review (approve/reject) is on; upload, trash and folder management are
 * not — that stays inside the team's own dashboard.
 */
export function OutputView({ rows, showToast }) {
  const [release, setRelease] = useState(null);
  const [collection, setCollection] = useState(null);
  const [dress, setDress] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  // One filter, applied at every level: a release or collection still shows
  // up as long as at least one of its dresses matches, so narrowing to
  // "Needs Revision" surfaces exactly the batches that need attention
  // instead of hiding everything down to an empty screen.
  const matches = (r) => !statusFilter || (r.status || "Not Started") === statusFilter;

  const releases = useMemo(() => {
    const set = [...new Set(rows.filter(matches).map((r) => r.release || "Unsorted"))];
    return sortReleasesByRecency(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusFilter]);

  const releaseRows = useMemo(
    () => (release ? rows.filter((r) => (r.release || "Unsorted") === release && matches(r)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, release, statusFilter]
  );
  const collections = useMemo(() => {
    const map = {};
    releaseRows.forEach((r) => {
      const c = r.collection || "Unsorted";
      (map[c] = map[c] || []).push(r);
    });
    return map;
  }, [releaseRows]);
  const collectionRows = collection ? collections[collection] || [] : [];

  const crumb = (label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-1.5 flex-wrap mb-5 text-sm">
        {crumb("Outputs", () => {
          setRelease(null);
          setCollection(null);
          setDress(null);
        })}
        {release ? (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {collection || dress ? (
              crumb(release, () => {
                setCollection(null);
                setDress(null);
              })
            ) : (
              <span className="text-sm font-bold text-foreground">{release}</span>
            )}
          </>
        ) : null}
        {collection ? (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {dress ? (
              crumb(collection, () => setDress(null))
            ) : (
              <span className="text-sm font-bold text-foreground">{collection}</span>
            )}
          </>
        ) : null}
        {dress ? (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{dress.dress}</span>
          </>
        ) : null}
        {!dress ? (
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ml-auto text-xs">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {dress ? (
        <DressFiles
          dress={dress}
          canWrite={false}
          canReview={true}
          showToast={showToast}
          onClose={() => setDress(null)}
        />
      ) : collection ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {collectionRows.map((r) => {
            const delivered = r.status === "Delivered";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setDress(r)}
                className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center hover:border-primary hover:-translate-y-0.5 transition-all rise"
              >
                <div className="size-12 rounded-xl grid place-items-center bg-secondary">
                  <Shirt className="size-5 text-muted-foreground" />
                </div>
                <p className="font-bold text-sm text-foreground truncate w-full">{r.dress}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Images className="size-3" /> {r.files != null ? r.files : "—"} files
                </p>
                {delivered ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--good)", color: "var(--good-foreground)" }}>
                    Delivered
                  </span>
                ) : null}
              </button>
            );
          })}
          {!collectionRows.length ? (
            <p className="col-span-full text-center text-sm text-muted-foreground py-10">Nothing in this collection yet.</p>
          ) : null}
        </div>
      ) : release ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.keys(collections).map((col) => {
            const colRows = collections[col];
            const delivered = colRows.filter((r) => r.status === "Delivered").length;
            return (
              <button
                key={col}
                type="button"
                onClick={() => setCollection(col)}
                className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4 text-left hover:border-primary hover:-translate-y-0.5 transition-all rise"
              >
                <div className="size-12 rounded-xl grid place-items-center bg-secondary shrink-0">
                  <Layers className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{col}</p>
                  <p className="text-xs text-muted-foreground">
                    {colRows.length} dress{colRows.length === 1 ? "" : "es"} · {delivered} delivered
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {releases.map((rel) => {
            const rr = rows.filter((r) => (r.release || "Unsorted") === rel && matches(r));
            const delivered = rr.filter((r) => r.status === "Delivered").length;
            const cols = new Set(rr.map((r) => r.collection || "Unsorted")).size;
            return (
              <button
                key={rel}
                type="button"
                onClick={() => setRelease(rel)}
                className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4 text-left hover:border-primary hover:-translate-y-0.5 transition-all rise"
              >
                <div className="size-12 rounded-xl grid place-items-center bg-primary/15 shrink-0">
                  <Layers className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{rel}</p>
                  <p className="text-xs text-muted-foreground">
                    {cols} collection{cols === 1 ? "" : "s"} · {rr.length} dresses · {delivered} delivered
                  </p>
                </div>
              </button>
            );
          })}
          {!releases.length ? (
            <p className="col-span-full text-center text-sm text-muted-foreground py-10">Nothing has been dropped yet.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
