import { Shirt, Sparkles, LayoutGrid, ShieldAlert, Coins, Folder, ChevronRight } from "lucide-react";
import { fmt, shortRelease, MILESTONE_TARGET, RELEASE_LINKS } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";
import { MascotRider } from "@/components/mascot";
import { BulkStatusControl } from "./status-select";
import { CostInput } from "./dress-table";

const STATUS_ORDER = ["Delivered", "In Progress", "Needs Revision", "Not Started", "Discarded"];
const STATUS_COLOR = {
  Delivered: "var(--good)",
  "In Progress": "var(--info)",
  "Needs Revision": "var(--warn)",
  "Not Started": "var(--muted-foreground)",
  Discarded: "var(--destructive)",
};

function BreakdownBar({ subset, h = 8 }) {
  const total = subset.length || 1;
  return (
    <div className="flex rounded-full overflow-hidden bg-muted" style={{ height: h }}>
      {STATUS_ORDER.map((s) => {
        const n = subset.filter((r) => (r.status || "Not Started") === s).length;
        if (!n) return null;
        const pct = (n / total) * 100;
        return <div key={s} title={`${s}: ${n}`} style={{ width: `${pct}%`, background: STATUS_COLOR[s] }} />;
      })}
    </div>
  );
}

function BarRow({ label, pct, valueLabel }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold w-16 shrink-0 truncate text-muted-foreground">{label}</span>
      <div className="flex-1 rounded-full bg-muted overflow-hidden" style={{ height: 10 }}>
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--primary), var(--warn))" }}
        />
      </div>
      <span className="f-mono text-xs font-semibold w-10 text-right shrink-0 text-muted-foreground">
        {valueLabel != null ? valueLabel : Math.round(pct) + "%"}
      </span>
    </div>
  );
}

function StatTile({ label, value, colorVar, Icon }) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-4 rise">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className="size-7 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in oklch, ${colorVar} 18%, transparent)`, color: colorVar }}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="f-heading font-extrabold text-3xl text-foreground">{value}</div>
    </div>
  );
}

export function OverviewStats({ rows, totalCost, mascot, onMascotClick }) {
  const total = rows.length;
  const delivered = rows.filter((r) => r.status === "Delivered").length;
  const inProgress = rows.filter((r) => r.status === "In Progress").length;
  const revision = rows.filter((r) => r.status === "Needs Revision").length;
  const goalPct = Math.min(100, (delivered / MILESTONE_TARGET) * 100);
  const ridePct = Math.max(6, Math.min(94, goalPct));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatTile label="Total Dresses" value={fmt(total)} colorVar="var(--primary)" Icon={Shirt} />
        <StatTile label="Delivered" value={fmt(delivered)} colorVar="var(--good)" Icon={Sparkles} />
        <StatTile label="In Progress" value={fmt(inProgress)} colorVar="var(--info)" Icon={LayoutGrid} />
        <StatTile label="Needs Revision" value={fmt(revision)} colorVar="var(--warn)" Icon={ShieldAlert} />
        <StatTile label="Credit Cost" value={fmt(totalCost)} colorVar="var(--destructive)" Icon={Coins} />
      </div>
      <div className="rounded-[20px] border border-border bg-card p-4 mb-5 rise" style={{ overflow: "visible" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Road to 1,000 — {fmt(delivered)} of {fmt(MILESTONE_TARGET)} delivered
          </span>
          <span className="f-mono text-xs font-bold text-primary">{goalPct.toFixed(1)}%</span>
        </div>
        <div className="relative progress-zone" style={{ marginTop: 30 }}>
          <div className="rounded-full bg-muted overflow-hidden" style={{ height: 12 }}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${goalPct}%`, background: "linear-gradient(90deg, var(--primary), var(--warn))" }}
            />
          </div>
          <MascotRider
            mood={mascot.mood}
            message={mascot.message}
            active={mascot.active}
            leftPct={ridePct}
            onClick={onMascotClick}
          />
        </div>
      </div>
    </>
  );
}

export function OverviewChart({ releases, rowsFor }) {
  if (!releases.length) return null;
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 mb-5 rise">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="size-4 text-destructive" />
        <h2 className="f-heading font-bold text-sm text-foreground">Delivered % by batch</h2>
      </div>
      <div className="flex flex-col gap-2.5">
        {releases.map((rel) => {
          const rr = rowsFor(rel);
          const pct = rr.length ? (rr.filter((r) => r.status === "Delivered").length / rr.length) * 100 : 0;
          return <BarRow key={rel} label={shortRelease(rel)} pct={pct} />;
        })}
      </div>
    </div>
  );
}

export function BatchCard({ rel, rr, colCount, noteCount, cost, canEdit, sync, onNav, onBulkStatus, onCostChange, onCostRetry }) {
  const delivered = rr.filter((r) => r.status === "Delivered").length;
  const pct = rr.length ? (delivered / rr.length) * 100 : 0;
  const relLink = RELEASE_LINKS[rel];
  const complete = rr.length > 0 && delivered === rr.length;

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 rise relative overflow-hidden card-hover transition-shadow">
      {complete ? (
        <span
          className="absolute top-4 right-4 f-mono text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: "var(--good)", color: "var(--good-foreground)" }}
        >
          🎉 Complete
        </span>
      ) : null}
      <div className="flex items-start gap-4 mb-4">
        <Ring pct={pct} size={60} />
        <div className="min-w-0">
          <h3 className="f-heading font-bold text-lg leading-tight truncate text-foreground">{rel}</h3>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {colCount} collection{colCount === 1 ? "" : "s"} · {rr.length} dress{rr.length === 1 ? "" : "es"} · {delivered} delivered
            {noteCount ? ` · ${noteCount} note${noteCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>
      <BreakdownBar subset={rr} />
      <div className="flex items-center gap-2 flex-wrap mt-4">
        <BulkStatusControl disabled={!canEdit} onPick={(status) => onBulkStatus("release", rel, status, rr.length)} />
        <CostInput
          scope="release"
          keyName={rel}
          value={cost}
          syncState={sync[`cost:release:${rel}`] || "idle"}
          disabled={!canEdit}
          onChange={onCostChange}
          onRetry={() => onCostRetry("release", rel)}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <button
          type="button"
          onClick={() => onNav(rel)}
          className="rounded-xl bg-primary text-primary-foreground text-xs px-3 py-2 flex items-center gap-1.5 font-bold"
        >
          View collections <ChevronRight className="size-3.5" />
        </button>
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
      </div>
    </div>
  );
}
