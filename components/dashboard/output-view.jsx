"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ImageOff } from "lucide-react";
import { sortReleasesByRecency, STATUS_OPTIONS } from "@/lib/constants";
import { Select } from "@/components/ui/input";
import { driveList, driveThumbUrl, fetchReviewCounts } from "@/lib/api";
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
function CoverThumb({ dressId, className, onFileCount }) {
  const [fileId, setFileId] = useState(undefined); // undefined = loading, null = none found
  useEffect(() => {
    let ignore = false;
    if (!dressId) return;
    driveList({ dressId })
      .then((data) => {
        if (ignore) return;
        const files = data.files || [];
        const first = files.find((f) => !f.isFolder && f.isImage);
        setFileId(first ? first.id : null);
        // The dress row's own `files` count (dresses.files in D1) is only
        // ever as fresh as the last "Resync from Drive" click - it does not
        // move on its own as pictures are uploaded or removed, so it drifts
        // and sits wrong indefinitely. This request is already being made
        // for the cover photo, so the real count comes along for free: the
        // one place in this view that shows "N files" uses this instead of
        // that stale column.
        onFileCount?.(files.filter((f) => !f.isFolder).length);
      })
      .catch(() => {
        if (!ignore) setFileId(null);
      });
    return () => {
      ignore = true;
    };
  }, [dressId, onFileCount]);

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
/**
 * Top-right corner readout of how a dress's own images have been reviewed:
 * green for how many are approved, yellow (this app's existing colour for
 * "has feedback" - see COMMENTED_STYLE in file-tile.jsx) for how many have
 * a comment thread. Both numbers are the dress's TOTAL across every
 * revision round - the count itself doesn't know versions exist, since
 * file_reviews and file_comments are keyed by dress_id alone regardless of
 * which round a file sits in (see getReviewCountsForDresses). Renders
 * nothing at all when both are zero, so a dress nobody has looked at yet
 * doesn't grow a "0 · 0" badge on every tile in the grid.
 */
function ReviewCountBadge({ counts }) {
  if (!counts || (!counts.approved && !counts.feedback)) return null;
  return (
    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
      {counts.approved ? (
        <span
          className="f-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm leading-none"
          style={{ background: "var(--good)", color: "var(--good-foreground)" }}
          title={`${counts.approved} approved`}
        >
          {counts.approved}
        </span>
      ) : null}
      {counts.feedback ? (
        <span
          className="f-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm leading-none"
          style={{ background: "var(--warn)", color: "var(--warn-foreground)" }}
          title={`${counts.feedback} with feedback`}
        >
          {counts.feedback}
        </span>
      ) : null}
    </div>
  );
}

function CoverTile({ coverDressId, title, subtitle, badge, onClick, wide, liveFileCount, reviewCounts }) {
  // Starts as whatever the caller passed (the board's own cached count, so
  // there is something to show immediately) and is replaced the moment the
  // cover photo's own fetch reports the real number - see the onFileCount
  // comment in CoverThumb for why that fetch is the source of truth here.
  const [count, setCount] = useState(null);
  const displaySubtitle = liveFileCount && count != null ? `${count} file${count === 1 ? "" : "s"}` : subtitle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[14px] text-left border border-border card-hover ${
        wide ? "aspect-[4/3]" : "aspect-[4/5]"
      }`}
    >
      <CoverThumb
        dressId={coverDressId}
        className="absolute inset-0 size-full object-cover object-top"
        onFileCount={liveFileCount ? setCount : undefined}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      {badge ? (
        <span
          className="absolute top-3 left-3 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: "var(--good)", color: "var(--good-foreground)" }}
        >
          {badge}
        </span>
      ) : null}
      <ReviewCountBadge counts={reviewCounts} />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-bold text-white text-base leading-snug truncate" style={{ textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
          {title}
        </p>
        <p className="text-xs text-white/80 mt-0.5">{displaySubtitle}</p>
      </div>
    </button>
  );
}

/**
 * A collection's own cover: one tile per dress inside it, each showing that
 * dress's own cover photo - or CoverThumb's own empty-state icon where
 * nothing has been shot yet. Six dresses, three shot, reads as three
 * pictures and three blanks at a glance; no title, no count, no text at
 * all, because the mosaic already says everything a caption would have.
 *
 * Replaces borrowing the FIRST dress's photo to stand in for the whole
 * collection - a single cover could never show that a collection was half
 * empty, only ever that it wasn't.
 */
function CollectionMosaicTile({ dressRows, onClick, reviewCounts }) {
  const n = dressRows.length;
  // Roughly square: 4 dresses is 2x2, 9 is 3x3. Clamped so two dresses
  // don't stretch into two huge tiles and twenty don't shrink to dust.
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n))));
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-[14px] border border-border card-hover aspect-[4/3] grid gap-0.5 bg-border"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "1fr" }}
    >
      {dressRows.map((r) => (
        // Each cell is `relative` and the image inside it `absolute inset-0`
        // - not a normal-flow grid item. A normal-flow <img> here has no
        // definite height to size against (percentage height can't resolve
        // in a 1fr row until the row itself has a definite height, and the
        // row doesn't until its content does - a circular dependency the
        // browser resolves by falling back to the image's own intrinsic
        // size), and that intrinsic size then grows the whole grid - and the
        // card's aspect-[4/3] height along with it - well past where
        // overflow-hidden clips it, which is what made every row after the
        // first invisible. Taking the image out of flow entirely breaks the
        // cycle: the cell's size comes only from the grid track, never from
        // what's inside it. Same trick the single-photo tile above already
        // uses for the same reason.
        <div key={r.id} className="relative">
          <CoverThumb dressId={r.id} className="absolute inset-0 size-full object-cover object-top" />
          <ReviewCountBadge counts={reviewCounts?.[r.id]} />
        </div>
      ))}
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

  // Fetched once per release for every dress in it - covers both screens
  // that show a per-dress badge (the collection mosaics and the dress cards
  // one level in), since collectionRows is always a subset of releaseRows.
  // Re-fires whenever the actual set of dress ids changes, not on every
  // render - releaseRows is a fresh array each render even when its
  // contents haven't, so the dependency is the ids themselves, joined into
  // one string, rather than the array.
  const [reviewCounts, setReviewCounts] = useState({});
  const releaseDressIds = releaseRows.map((r) => r.id).join(',');
  useEffect(() => {
    if (!releaseDressIds) return;
    let ignore = false;
    fetchReviewCounts({ dressIds: releaseDressIds.split(',') })
      .then((data) => {
        if (!ignore) setReviewCounts(data.counts || {});
      })
      .catch(() => {
        // A missing badge is a fine failure mode - the tile itself, and
        // everything it actually does, works the same either way.
      });
    return () => {
      ignore = true;
    };
  }, [releaseDressIds]);

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
              liveFileCount
              badge={r.status === "Delivered" ? "Delivered" : null}
              reviewCounts={reviewCounts[r.id]}
              onClick={() => setDress(r)}
            />
          ))}
          {!collectionRows.length ? (
            <p className="col-span-full text-center text-sm text-muted-foreground py-10">Nothing in this collection yet.</p>
          ) : null}
        </div>
      ) : release ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {Object.keys(collections).map((col) => (
            <CollectionMosaicTile
              key={col}
              dressRows={collections[col]}
              reviewCounts={reviewCounts}
              onClick={() => setCollection(col)}
            />
          ))}
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
