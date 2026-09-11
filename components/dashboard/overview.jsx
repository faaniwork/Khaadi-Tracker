"use client";

import { useState } from "react";
import { Shirt, Sparkles, LayoutGrid, ShieldAlert, Coins, ChevronRight, Check, Ban, Repeat2, Trash2 } from "lucide-react";
import { fmt, shortRelease, MILESTONE_TARGET, RELEASE_LINKS } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MascotRider } from "@/components/mascot";
import { DriveIcon } from "@/components/ui/drive-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkStatusControl } from "./status-select";
import { CostInput } from "./dress-table";

function BarRow({ label, pct, valueLabel }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold w-14 shrink-0 truncate text-muted-foreground">{label}</span>
      <div className="flex-1 rounded-full bg-muted overflow-hidden" style={{ height: 8 }}>
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: "var(--primary)" }}
        />
      </div>
      <span className="f-mono text-xs font-semibold w-10 text-right shrink-0 text-muted-foreground">
        {valueLabel != null ? valueLabel : Math.round(pct) + "%"}
      </span>
    </div>
  );
}

/**
 * One reading in the summary strip.
 *
 * Not a card: five bordered boxes in a row read as five separate things to
 * consider, when they are five readings OF ONE THING. They share a single
 * border now and are separated by dividers, which is both quieter and
 * honest about what they are.
 */
function StatCell({ label, value, sub, colorVar, Icon, last }) {
  return (
    <div
      className={`p-3 sm:p-3.5 border-b lg:border-b-0 border-border ${last ? "" : "lg:border-r"}`}
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4" style={{ color: colorVar }} />
      </div>
      <div className="flex items-baseline gap-2">
        <div className="f-mono text-[22px] sm:text-[26px] leading-none font-medium tracking-[-0.02em] text-foreground">
          {value}
        </div>
        {/* Grayed out and small on purpose - this is the credit figure's own
            footnote, not a reading of equal weight next to it. */}
        {sub ? <span className="f-mono text-[11px] font-semibold text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

/**
 * Stands in for the whole summary area - the stat strip, and the milestone
 * bar and per-batch chart that sit side by side beneath it - while the
 * board's first load is still in flight. Mirrors the real layout's own
 * spacing and column split exactly, so nothing shifts once the numbers
 * land. Always four stat cells: canEdit (which decides the fifth, Credit
 * Cost) isn't known yet either at this point, and defaults to false until
 * the role comes back with everything else.
 */
export function OverviewStatsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[14px] border border-border bg-card overflow-hidden mb-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`p-3 sm:p-3.5 border-b lg:border-b-0 border-border ${i === 3 ? "" : "lg:border-r"}`}>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-x-10 gap-y-6 mb-5">
        <div>
          <div className="flex items-baseline justify-between mb-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="mt-12">
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-2 w-full rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Same footprint as one real BatchCard, so the grid it sits in doesn't
 * reflow once actual batches arrive. */
export function BatchCardSkeleton() {
  return (
    <div className="rounded-[14px] border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-14 rounded-full shrink-0" />
        <div className="min-w-0 flex-1 pt-1">
          <Skeleton className="h-4 w-28 mb-2" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-[10px]" />
        <Skeleton className="h-8 w-20 rounded-[10px]" />
        <Skeleton className="h-8 w-14 rounded-[10px]" />
      </div>
      <Skeleton className="h-9 w-36 rounded-xl" />
      <div className="pt-3 border-t border-border">
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export function OverviewStats({ rows, totalCost, showCost = true }) {
  const total = rows.length;
  const delivered = rows.filter((r) => r.status === "Delivered").length;
  const inProgress = rows.filter((r) => r.status === "In Progress").length;
  const revision = rows.filter((r) => r.status === "Needs Revision").length;
  // Cost per outfit: what a delivered dress actually costs once the whole
  // batch's credits are spread across it, not just the raw total anyone
  // could already add up themselves. Null rather than 0 with nothing
  // delivered yet, since dividing by zero delivered dresses is not "free."
  const cpo = delivered ? Math.round(totalCost / delivered) : null;

  const cells = [
    { label: "Total Dresses", value: fmt(total), colorVar: "var(--muted-foreground)", Icon: Shirt },
    { label: "Delivered", value: fmt(delivered), colorVar: "var(--good)", Icon: Sparkles },
    { label: "In Progress", value: fmt(inProgress), colorVar: "var(--info)", Icon: LayoutGrid },
    { label: "Needs Revision", value: fmt(revision), colorVar: "var(--warn)", Icon: ShieldAlert },
    // Money is a team concern, not a viewer one - a client or a viewer
    // reviewing images has no business seeing what the shoot cost.
    ...(showCost
      ? [
          {
            label: "Credit Cost",
            value: fmt(totalCost),
            sub: cpo != null ? `CPO ${fmt(cpo)}` : null,
            colorVar: "var(--muted-foreground)",
            Icon: Coins,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid grid-cols-2 ${showCost ? "lg:grid-cols-5" : "lg:grid-cols-4"} rounded-[14px] border border-border bg-card overflow-hidden mb-5 rise`}
    >
      {cells.map((c, i) => (
        <StatCell key={c.label} {...c} last={i === cells.length - 1} />
      ))}
    </div>
  );
}

/**
 * Road to 1,000, with the mascot riding the track.
 *
 * Split out of OverviewStats so it can sit BESIDE the per-batch chart on a
 * wide screen instead of above it. Stacked, the two of them plus the stat
 * strip ate over 400px before a single batch card appeared - on a laptop
 * that left the actual work squeezed into whatever was below the fold. Side
 * by side they cost the height of the taller one instead of both, and the
 * bars stop spanning 1,600px to show five numbers.
 *
 * No card around it. It is one line of text and one bar; a border and a
 * panel would be more furniture than content.
 */
export function MilestoneBar({ rows, mascot, onMascotClick }) {
  const delivered = rows.filter((r) => r.status === "Delivered").length;
  const goalPct = Math.min(100, (delivered / MILESTONE_TARGET) * 100);
  // Kept off the very ends of the track so the speech bubble never hangs off
  // the side of the page.
  const ridePct = Math.max(6, Math.min(94, goalPct));
  return (
    <div style={{ overflow: "visible" }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Road to 1,000
        </span>
        <span className="f-mono text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{fmt(delivered)}</span> of{" "}
          {fmt(MILESTONE_TARGET)} · {goalPct.toFixed(1)}%
        </span>
      </div>
      {/* The rider hangs off the top of the track, so the track needs its
          own clearance below the label. It had 30px for a 42px mascot
          before, which is precisely why the poor thing was sitting on top
          of the words - this is the one measurement on this screen that
          isn't free to tighten. */}
      <div className="relative progress-zone mt-12">
        <div className="rounded-full bg-muted overflow-hidden" style={{ height: 8 }}>
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${goalPct}%`, background: "var(--primary)" }}
          />
        </div>
        <MascotRider
          mood={mascot?.mood}
          message={mascot?.message}
          active={mascot?.active}
          leftPct={ridePct}
          onClick={onMascotClick}
        />
      </div>
    </div>
  );
}

/**
 * Desktop only, deliberately. Every number in here is already on the batch
 * card for that batch - its ring, its percentage, its delivered count -
 * sitting a few hundred pixels lower on the same screen. On a wide screen
 * that repetition is free: it shares a row with the milestone bar and costs
 * nothing that wasn't already empty. On a phone it cost a full screen of
 * scrolling to reach the cards that say the same thing, which is the
 * opposite of a summary.
 */
export function OverviewChart({ releases, rowsFor }) {
  if (!releases.length) return null;
  return (
    <div className="hidden lg:block">
      <h2 className="f-heading text-sm font-semibold text-foreground mb-3">Delivered % by batch</h2>
      <div className="flex flex-col gap-2">
        {releases.map((rel) => {
          const rr = rowsFor(rel);
          const pct = rr.length ? (rr.filter((r) => r.status === "Delivered").length / rr.length) * 100 : 0;
          return <BarRow key={rel} label={shortRelease(rel)} pct={pct} />;
        })}
      </div>
    </div>
  );
}

/**
 * How many revision rounds this batch has been through. Zero by default,
 * because most batches never need one and a default of 1 would quietly
 * claim otherwise.
 */
function RevisionsSelect({ value, disabled, onChange }) {
  return (
    <label
      className="flex items-center gap-1.5 rounded-[10px] border border-border bg-secondary/60 pl-2.5 pr-1 py-1"
      title="Revision rounds for this batch"
    >
      <Repeat2 className="size-3.5 text-muted-foreground" />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Revision rounds for this batch"
        className="f-mono text-xs bg-transparent text-foreground outline-none cursor-pointer disabled:cursor-not-allowed pr-1"
      >
        {Array.from({ length: 10 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Why a batch went the way it did, on the card rather than a click away.
 *
 * The full thread lives in Batch tools; this shows the latest line and takes
 * a new one, which is what someone glancing at the board actually needs —
 * "why was this rejected" answered without navigating.
 */
function CardNotes({ list, canEdit, onAddNote }) {
  const [text, setText] = useState("");
  const notes = list || [];
  const latest = notes[notes.length - 1];

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onAddNote(clean);
    setText("");
  };

  return (
    <div className="pt-3 border-t border-border">
      {latest ? (
        <p className="text-xs text-muted-foreground leading-snug">
          <span className="font-semibold text-foreground">{latest.by || "Someone"}:</span>{" "}
          {latest.text}
          {notes.length > 1 ? (
            <span className="text-muted-foreground/70"> · {notes.length - 1} earlier</span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}
      {canEdit ? (
        <div className="flex items-center gap-1.5 mt-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Why did this batch go this way?"
            className="flex-1 min-w-0 text-xs py-1.5"
          />
          <Button variant="ghost" size="sm" onClick={submit} disabled={!text.trim()}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function BatchCard({
  rel,
  driveLink,
  rr,
  colCount,
  noteCount,
  cost,
  revisions,
  notes,
  canEdit,
  sync,
  onNav,
  onBulkStatus,
  onCostChange,
  onCostRetry,
  onRevisionsChange,
  onAddNote,
  onDelete,
}) {
  const delivered = rr.filter((r) => r.status === "Delivered").length;
  const discarded = rr.filter((r) => r.status === "Discarded").length;
  const pct = rr.length ? (delivered / rr.length) * 100 : 0;
  // driveLink is passed for batches created on the board, whose folder is
  // recorded in the database rather than in the RELEASE_LINKS constant.
  const relLink = driveLink || RELEASE_LINKS[rel];
  const complete = rr.length > 0 && delivered === rr.length;
  const allDiscarded = rr.length > 0 && discarded === rr.length;

  // A fully delivered batch shows a checkmark in the ring, which already says
  // "complete" without a separate badge repeating it in the corner.
  const ringColor = allDiscarded ? "var(--destructive)" : complete ? "var(--good)" : undefined;
  const ringLabel = allDiscarded ? (
    <Ban className="size-5" style={{ color: "var(--destructive)" }} />
  ) : complete ? (
    <Check className="size-5" style={{ color: "var(--good)" }} />
  ) : Math.round(pct) ? (
    undefined
  ) : (
    ""
  );

  // The ring's own checkmark already says "fully delivered" - repeating the
  // count right next to it ("13 dresses · 13 delivered") was saying the
  // same thing twice. Only the dress count is worth keeping once the two
  // numbers are identical; short of complete, the delivered count is real
  // information the ring's bare percentage doesn't give you.
  const meta = [
    `${colCount} collection${colCount === 1 ? "" : "s"}`,
    `${rr.length} dress${rr.length === 1 ? "" : "es"}`,
    ...(complete ? [] : [`${delivered} delivered`]),
    ...(noteCount ? [`${noteCount} note${noteCount === 1 ? "" : "s"}`] : []),
  ].join(" · ");

  return (
    <div
      className="rounded-[14px] border border-border bg-card p-5 relative overflow-hidden card-hover flex flex-col gap-4"
      style={allDiscarded ? { borderColor: "var(--destructive)" } : undefined}
    >
      <div className="flex items-start gap-3.5">
        <Ring pct={allDiscarded ? 100 : pct} size={56} color={ringColor} label={ringLabel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="f-heading text-base font-semibold leading-tight truncate text-foreground">{rel}</h3>
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(rel)}
                title="Delete this batch"
                aria-label={`Delete ${rel}`}
                className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
          <p className="text-xs mt-1 text-muted-foreground leading-snug">{meta}</p>
        </div>
      </div>

      {/* All three are write actions with nothing to show someone who
          can't use them - team-only tools, gone outright for a viewer
          rather than sitting there disabled. */}
      {canEdit ? (
        <div className="flex items-center gap-2 flex-wrap">
          <BulkStatusControl onPick={(status) => onBulkStatus("release", rel, status, rr.length)} />
          <CostInput
            scope="release"
            keyName={rel}
            value={cost}
            syncState={sync[`cost:release:${rel}`] || "idle"}
            disabled={!canEdit}
            onChange={onCostChange}
            onRetry={() => onCostRetry("release", rel)}
          />
          <RevisionsSelect
            value={revisions || 0}
            disabled={!canEdit}
            onChange={(n) => onRevisionsChange(rel, n)}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNav(rel)}
          className="rounded-xl bg-primary text-primary-foreground text-xs px-3 py-2 flex items-center gap-1.5 font-bold"
        >
          View collections <ChevronRight className="size-3.5" />
        </button>
        {/* Drive is where the team manages files, not somewhere a viewer
            or client should ever need to go. */}
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
      </div>

      <CardNotes list={notes} canEdit={canEdit} onAddNote={(text) => onAddNote(rel, text)} />
    </div>
  );
}
