"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ImageOff } from "lucide-react";
import { sortReleasesByRecency, STATUS_OPTIONS } from "@/lib/constants";
import { Select } from "@/components/ui/input";
import { driveList, driveThumbUrl } from "@/lib/api";
import { DressFiles } from "./files";
import { DownloadMenu } from "@/components/files/download-menu";

function sortedReleases(rows) {
  const set = [...new Set(rows.map((r) => r.release || "Unsorted"))];
  return sortReleasesByRecency(set);
}

/**
 * A dress's own first image, standing in for the whole batch/collection/
 * dress it represents. One real photo says more at a glance than an icon in
 * a tinted circle ever could, and it is why every tile here looks like a
 * cover, not a list row with a label.
 */
function CoverThumb({ dressId, className }) {
  const [fileId, setFileId] = useState(undefined); // undefined = loading, null = none found
  useEffect(() => {
    let ignore = false;
    if (!dressId) return;
    driveList({ dressId })
      .then((data) => {
        if (ignore) return;
        const first = (data.files || []).find((f) => !f.isFolder && f.isImage);
        setFileId(first ? first.id : null);
      })
      .catch(() => {
        if (!ignore) setFileId(null);
      });
    return () => {
      ignore = true;
    };
  }, [dressId]);

  if (fileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={driveThumbUrl({ fileId, dressId, size: 400 })} alt="" className={className} />
    );
  }
  return (
    <div className={`${className} bg-secondary grid place-items-center`}>
      {fileId === null ? (
        <ImageOff className="size-6 text-muted-foreground/50" />
      ) : (
        <div className="size-6 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
      )}
    </div>
  );
}

/**
 * One browsable tile: a photo filling the frame, its name and a stat line
 * sitting in a gradient at the bottom. The same shape at every level (batch,
 * collection, dress) rather than an icon-in-a-box list row — the picture
 * carries the content, the chrome stays out of the way.
 */
function CoverTile({ coverDressId, title, subtitle, badge, onClick, wide }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[14px] text-left border border-border card-hover ${
        wide ? "aspect-[4/3]" : "aspect-[4/5]"
      }`}
    >
      <CoverThumb dressId={coverDressId} className="absolute inset-0 size-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      {badge ? (
        <span
          className="absolute top-3 left-3 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: "var(--good)", color: "var(--good-foreground)" }}
        >
          {badge}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-bold text-white text-base leading-snug truncate" style={{ textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
          {title}
        </p>
        <p className="text-xs text-white/80 mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}

/**
 * The client-facing side of the board: batches → collections → dresses →
 * images, with nothing else on it. No credits, no revisions, no status
 * dropdowns, no Drive links — those are dashboard concerns for the team.
 *
 * Opening a dress goes straight to its images. There is no extra "click to
 * see 24 files" step in between; DressFiles is rendered already expanded.
 * `canWrite` is passed straight through to it — a client only ever gets
 * `false` (review only), an admin or editor gets the same upload/trash/
 * folder access here as inside their own dashboard, so nobody has to leave
 * this view to manage a file.
 *
 * `autoLatest` skips the batch-picker screen entirely and lands straight in
 * the most recent release's collections — for a client, that is the only
 * batch that matters most weeks, and making them pick it out of a list every
 * time was exactly the extra click this view exists to remove.
 */
export function OutputView({
  rows,
  showToast,
  canWrite = false,
  autoLatest = false,
  initialRelease = null,
  initialDressId = null,
  onOpenBatchTools,
}) {
  // Landing on a specific dress — from an activity entry about feedback on
  // one of its images. The dress row carries its own release and collection,
  // so the whole trail can be opened from the id alone.
  const landing = initialDressId ? rows.find((r) => String(r.id) === String(initialDressId)) : null;
  // `initialRelease` is how the sidebar and a batch card's "View collections"
  // land you straight inside a batch. The caller keys this component by that
  // release, so arriving at a different one remounts with it rather than
  // needing this state to be lifted and controlled from outside.
  const [release, setRelease] = useState(
    () =>
      (landing ? landing.release || "Unsorted" : null) ||
      initialRelease ||
      (autoLatest ? sortedReleases(rows)[0] || null : null)
  );
  const [collection, setCollection] = useState(() => (landing ? landing.collection || "Unsorted" : null));
  const [dress, setDress] = useState(() => landing || null);
  const [statusFilter, setStatusFilter] = useState("");

  // One filter, applied at every level: a release or collection still shows
  // up as long as at least one of its dresses matches, so narrowing to
  // "Needs Revision" surfaces exactly the batches that need attention
  // instead of hiding everything down to an empty screen.
  const matches = (r) => !statusFilter || (r.status || "In Progress") === statusFilter;

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

  // The trail and the actions beside it (download, batch tools, the status
  // filter) used to be one row with each control deciding for itself whether
  // it earned the ml-auto that pushed it to the right - three different
  // rules depending on whether a dress/collection/release was open. On a
  // phone that produced whichever mix of them happened to fit on the trail's
  // own line and dropped the rest wherever they landed, which is the
  // "Download" that showed up half off-screen. Splitting the actions into
  // their own group removes the guesswork: the trail wraps on its own line,
  // the actions wrap as a tidy row underneath, and only from sm up does
  // ml-auto pull that whole group back onto the trail's line.
  const actions = (
    <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
      {!dress && release ? (
        <DownloadMenu dresses={collection ? collectionRows : releaseRows} showToast={showToast} />
      ) : null}
      {release && onOpenBatchTools ? (
        <button
          type="button"
          onClick={() => onOpenBatchTools(release)}
          title="Notes, credit cost, statuses and Drive resync for this batch"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Batch tools
        </button>
      ) : null}
      {!dress ? (
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-5 text-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {release ? (
            crumb("All batches", () => {
              setRelease(null);
              setCollection(null);
              setDress(null);
            })
          ) : null}
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
        </div>
        {actions}
      </div>

      {dress ? (
        <DressFiles
          key={dress.id}
          dress={dress}
          canWrite={canWrite}
          canReview={true}
          showToast={showToast}
          onClose={() => setDress(null)}
        />
      ) : collection ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 stagger">
          {collectionRows.map((r) => (
            <CoverTile
              key={r.id}
              coverDressId={r.id}
              title={r.dress}
              subtitle={`${r.files != null ? r.files : "-"} files`}
              badge={r.status === "Delivered" ? "Delivered" : null}
              onClick={() => setDress(r)}
            />
          ))}
          {!collectionRows.length ? (
            <p className="col-span-full text-center text-sm text-muted-foreground py-10">Nothing in this collection yet.</p>
          ) : null}
        </div>
      ) : release ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {Object.keys(collections).map((col) => {
            const colRows = collections[col];
            const delivered = colRows.filter((r) => r.status === "Delivered").length;
            return (
              <CoverTile
                key={col}
                wide
                coverDressId={colRows[0]?.id}
                title={col}
                subtitle={`${colRows.length} dress${colRows.length === 1 ? "" : "es"} · ${delivered} delivered`}
                onClick={() => setCollection(col)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {releases.map((rel) => {
            const rr = rows.filter((r) => (r.release || "Unsorted") === rel && matches(r));
            const delivered = rr.filter((r) => r.status === "Delivered").length;
            const cols = new Set(rr.map((r) => r.collection || "Unsorted")).size;
            return (
              <CoverTile
                key={rel}
                wide
                coverDressId={rr[0]?.id}
                title={rel}
                subtitle={`${cols} collection${cols === 1 ? "" : "s"} · ${rr.length} dresses · ${delivered} delivered`}
                onClick={() => setRelease(rel)}
              />
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
