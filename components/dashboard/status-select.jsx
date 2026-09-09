import { STATUS_OPTIONS } from "@/lib/constants";

const STATUS_STYLE = {
  Delivered: { bg: "var(--good)", fg: "var(--good-foreground)" },
  "In Progress": { bg: "var(--info)", fg: "var(--info-foreground)" },
  "Needs Revision": { bg: "var(--warn)", fg: "var(--warn-foreground)" },
  Discarded: { bg: "var(--destructive)", fg: "var(--destructive-foreground)" },
  "Not Started": { bg: "var(--muted)", fg: "var(--muted-foreground)" },
};

export function StatusSelect({ value, disabled, onChange }) {
  const style = STATUS_STYLE[value] || STATUS_STYLE["Not Started"];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="chip f-mono text-[11px] font-bold px-3 py-1.5 border-0 cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-70"
      style={{ background: style.bg, color: style.fg }}
      title={disabled ? "View-only access — ask an admin for editor access" : undefined}
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Sets one status across every row in scope.
 *
 * Styled like every other control rather than as a hazard. It used to carry a
 * warning border and an alert glyph and then ask for confirmation on top,
 * which is a lot of friction for something the team does routinely and can
 * simply do again if they pick the wrong one.
 */
export function BulkStatusControl({ disabled, onPick }) {
  return (
    <select
      value=""
      disabled={disabled}
      title="Set this status on every row here"
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = "";
        if (v) onPick(v);
      }}
      className="rounded-[10px] border border-border bg-secondary/60 px-2.5 py-1.5 text-xs font-semibold text-foreground cursor-pointer outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">Set all to…</option>
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
