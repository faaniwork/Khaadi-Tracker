"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  RefreshCw,
  Coins,
  MessageSquare,
  Tag,
  ShieldCheck,
  Image as ImageIcon,
  FolderSync,
  Trash2,
  Link2,
  Repeat2,
  Plus,
} from "lucide-react";
import { timeAgo, fmt } from "@/lib/constants";
import { fetchActivity } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";

/**
 * Every kind of log entry, with the colour and icon that carries it.
 *
 * The list used to be one undifferentiated grey column, which made a wall of
 * cost edits impossible to skim past to find the thing you actually wanted.
 * Colour comes from the KIND of change, so the eye can filter before reading.
 */
const KINDS = {
  status: { label: "status", icon: Tag, color: "var(--info)" },
  comments: { label: "comment", icon: MessageSquare, color: "var(--muted-foreground)" },
  credits: { label: "credits", icon: Coins, color: "var(--warn)" },
  revisions: { label: "revisions", icon: Repeat2, color: "var(--warn)" },
  cost: { label: "cost", icon: Coins, color: "var(--warn)" },
  note: { label: "note", icon: MessageSquare, color: "var(--info)" },
  rename: { label: "rename", icon: Tag, color: "var(--primary)" },
  role: { label: "access", icon: ShieldCheck, color: "var(--destructive)" },
  review: { label: "review", icon: ImageIcon, color: "var(--good)" },
  file: { label: "file", icon: ImageIcon, color: "var(--good)" },
  trash: { label: "file removed", icon: Trash2, color: "var(--destructive)" },
  drive: { label: "Drive", icon: FolderSync, color: "var(--primary)" },
  link: { label: "review link", icon: Link2, color: "var(--primary)" },
  "batch created": { label: "batch created", icon: Plus, color: "var(--good)" },
  "batch removed": { label: "batch removed", icon: Trash2, color: "var(--destructive)" },
  default: { label: "change", icon: ActivityIcon, color: "var(--muted-foreground)" },
};

const STATUS_COLOR = {
  Delivered: "var(--good)",
  "In Progress": "var(--info)",
  "Needs Revision": "var(--warn)",
  Discarded: "var(--destructive)",
  "Not Started": "var(--muted-foreground)",
};

const VERBS = {
  status: "set status",
  comments: "edited the comment",
  credits: "changed credits",
  revisions: "changed revisions",
  cost: "changed cost",
  note: "added a note",
  rename: "renamed",
  role: "changed access",
  "batch created": "created batch",
  "batch removed": "removed batch",
};

/**
 * Numbers arrive from D1 as "32032423.0", which is unreadable at a glance and
 * was the single worst thing about this list. Credits are whole numbers, so
 * the decimal is dropped and thousands are separated.
 */
function prettyValue(raw) {
  const s = String(raw ?? "");
  if (!s) return "";
  if (/^-?\d+(\.0+)?$/.test(s)) return fmt(Math.round(Number(s)));
  if (/^-?\d+\.\d+$/.test(s)) {
    const n = Number(s);
    return Number.isInteger(n) ? fmt(n) : fmt(Math.round(n));
  }
  return s;
}

function classify(entry) {
  const scope = entry.scope || "";
  const field = entry.field || "";

  if (scope.startsWith("review-link:")) return KINDS.link;
  if (scope.startsWith("access:")) return KINDS.role;
  if (scope.startsWith("file:")) {
    if (/trash/i.test(String(entry.newValue))) return KINDS.trash;
    return KINDS.review;
  }
  if (/drive/i.test(field) || field === "added from Drive" || field === "back on the board") {
    return KINDS.drive;
  }
  return KINDS[field] || KINDS.default;
}

/**
 * Where clicking an entry should take you.
 *
 * Feedback — an approval, a rejection, a comment — is recorded against a
 * FILE inside a dress, so landing on the batch and leaving you to find the
 * dress yourself was most of the way to useless. Those now resolve to the
 * dress itself, and the caller opens its images.
 *
 * Returns null when there is nothing sensible to jump to (a bulk edit whose
 * scope is just a row count, a profile-picture change) and the row stays
 * unclickable rather than pretending to lead somewhere.
 */
function navTargetFor(entry, rows) {
  const scope = entry.scope || "";
  const rowFor = (id) => rows?.find((r) => String(r.id) === String(id));
  const releaseOf = (row) => (row ? row.release || "Unsorted" : null);

  // A dress, opened at its images.
  const dressTarget = (id) => {
    const row = rowFor(id);
    if (!row) return null;
    return { kind: "dress", release: releaseOf(row), dressId: String(row.id), dress: row.dress };
  };

  if (scope.startsWith("file:")) return dressTarget(scope.slice(5));
  if (scope.startsWith("row:")) return dressTarget(scope.slice(4));

  const releaseTarget = (release) => (release ? { kind: "release", release } : null);
  if (scope.startsWith("cost:release:")) return releaseTarget(scope.slice("cost:release:".length));
  if (scope.startsWith("cost:collection:")) {
    const col = scope.slice("cost:collection:".length);
    return releaseTarget(releaseOf(rows?.find((r) => (r.collection || "Unsorted") === col)));
  }
  if (scope.startsWith("note:")) return releaseTarget(scope.slice(5));
  if (scope.startsWith("collection:")) return releaseTarget(scope.slice(11));
  if (scope.startsWith("review-link:")) return releaseTarget(scope.slice(12));
  // A batch itself - created, removed, or its revisions count changed.
  // Distinct from "cost:release:" above (a different, longer prefix).
  if (scope.startsWith("release:")) return releaseTarget(scope.slice(8));
  if (scope.startsWith("access:")) return { kind: "page", page: "access" };
  return null;
}

/**
 * Which batch (release) an entry belongs to, for the batch filter. Mirrors
 * navTargetFor's own scope-sniffing rather than sharing code with it,
 * because the two have different jobs: navTargetFor also has to know when
 * NOT to be clickable, where this only needs a label to filter on and is
 * fine falling back to null (shows up under "No batch" - profile edits,
 * chat, anything that was never about one batch in the first place).
 */
function releaseFor(entry, rows) {
  const scope = entry.scope || "";
  const rowFor = (id) => rows?.find((r) => String(r.id) === String(id));
  const releaseOfRow = (row) => (row ? row.release || "Unsorted" : null);

  if (scope.startsWith("file:")) return releaseOfRow(rowFor(scope.slice(5)));
  if (scope.startsWith("row:")) return releaseOfRow(rowFor(scope.slice(4)));
  if (scope.startsWith("cost:release:")) return scope.slice("cost:release:".length);
  if (scope.startsWith("cost:collection:")) {
    const col = scope.slice("cost:collection:".length);
    return releaseOfRow(rows?.find((r) => (r.collection || "Unsorted") === col));
  }
  if (scope.startsWith("note:")) return scope.slice(5);
  if (scope.startsWith("collection:")) return scope.slice(11);
  if (scope.startsWith("review-link:")) return scope.slice(12);
  if (scope.startsWith("release:")) return scope.slice(8);
  return null;
}

/** The human-readable target of the change. */
function targetOf(entry) {
  const scope = entry.scope || "";
  if (scope.startsWith("row:")) return "a dress";
  if (scope.startsWith("file:")) return entry.field || "an image";
  if (scope.startsWith("bulk:")) return scope.replace("bulk:", "");
  if (scope.startsWith("cost:")) return scope.split(":").slice(1).join(" · ");
  if (scope.startsWith("note:")) return scope.replace("note:", "");
  if (scope.startsWith("collection:")) return scope.replace("collection:", "");
  if (scope.startsWith("access:")) return scope.replace("access:", "");
  if (scope.startsWith("review-link:")) return scope.replace("review-link:", "");
  if (scope.startsWith("profile:")) return "";
  // Was falling through to the raw scope ("release:Sep 24 Release" showing
  // up verbatim, colon and all) for batch created/removed and per-release
  // revisions edits - the one prefix the checks above didn't cover.
  if (scope.startsWith("release:")) return scope.replace("release:", "");
  return scope;
}

function verbFor(entry, kind) {
  const scope = entry.scope || "";
  if (scope.startsWith("file:")) {
    const v = String(entry.newValue || "");
    if (/trash/i.test(v)) return "removed";
    if (v.startsWith("approved")) return "approved";
    if (v.startsWith("rejected")) return "rejected";
    return "reviewed";
  }
  if (scope.startsWith("review-link:")) return `${entry.field} a review link for`;
  if (scope.startsWith("bulk:")) return "set status in bulk on";
  if (kind === KINDS.drive) return entry.field;
  return VERBS[entry.field] || `changed ${entry.field}`;
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yday = new Date(today);
  yday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function ValueChange({ entry }) {
  const from = prettyValue(entry.oldValue);
  const to = prettyValue(entry.newValue);
  if (!from && !to) return null;
  const toColor = STATUS_COLOR[entry.newValue];
  return (
    <p className="text-sm mt-0.5 break-words">
      {from ? <span className="line-through text-muted-foreground/70">{from}</span> : null}
      {from && to ? <span className="text-muted-foreground"> → </span> : null}
      {to ? (
        <span className="font-bold" style={toColor ? { color: toColor } : { color: "var(--foreground)" }}>
          {to}
        </span>
      ) : null}
    </p>
  );
}

export function ActivityPage({ profiles, rows, onJump }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [kindFilter, setKindFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");

  // Runs once on mount. State is only ever set inside the promise's
  // then/catch (never synchronously in the effect body), so there is no
  // fetch-in-effect race with React's render — the effect just kicks the
  // request off and lets it resolve on its own schedule.
  useEffect(() => {
    let ignore = false;
    fetchActivity(300)
      .then((data) => {
        if (ignore) return;
        setEntries(data.entries || []);
        setError(null);
      })
      .catch((e) => {
        if (ignore) return;
        setError(e.message || "Failed to load activity");
      });
    return () => {
      ignore = true;
    };
  }, []);

  const refresh = () => {
    setRefreshing(true);
    fetchActivity(300)
      .then((data) => {
        setEntries(data.entries || []);
        setError(null);
      })
      .catch((e) => setError(e.message || "Failed to load activity"))
      .finally(() => setRefreshing(false));
  };
  const loading = entries === null && !error;

  // Grouped by day, so a long list reads as a timeline rather than 300
  // interchangeable rows.
  const grouped = useMemo(() => {
    if (!entries) return [];
    const filtered = entries.filter((e) => {
      if (kindFilter && classify(e).label !== kindFilter) return false;
      if (batchFilter && (releaseFor(e, rows) || "No batch") !== batchFilter) return false;
      return true;
    });
    const out = [];
    let currentDay = null;
    filtered.forEach((e) => {
      const day = dayLabel(e.at);
      if (day !== currentDay) {
        out.push({ day, items: [] });
        currentDay = day;
      }
      out[out.length - 1].items.push(e);
    });
    return out;
  }, [entries, rows, kindFilter, batchFilter]);

  const availableKinds = useMemo(() => {
    if (!entries) return [];
    return [...new Set(entries.map((e) => classify(e).label))].sort();
  }, [entries]);

  // Only batches that actually still exist - a removed batch's own history
  // ("removed batch X") still shows up in the unfiltered feed, but offering
  // it as something to filter TO is offering a dead end that looks broken.
  const availableBatches = useMemo(() => {
    if (!entries) return [];
    const live = new Set((rows || []).map((r) => r.release || "Unsorted"));
    const set = new Set(
      entries.map((e) => releaseFor(e, rows) || "No batch").filter((b) => b === "No batch" || live.has(b))
    );
    const named = [...set].filter((b) => b !== "No batch").sort();
    return set.has("No batch") ? [...named, "No batch"] : named;
  }, [entries, rows]);

  const lookup = (name) => profiles?.byName?.[name];

  return (
    <div className="rounded-[14px] border border-border bg-card p-5 rise">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <ActivityIcon className="size-4 text-primary" />
        <h2 className="f-heading font-bold text-sm text-foreground">Activity</h2>
        <span className="text-xs text-muted-foreground">newest first</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {availableBatches.length > 1 ? (
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="rounded-[10px] border border-border bg-secondary/60 px-2 py-1.5 text-xs font-semibold text-foreground cursor-pointer outline-none focus-visible:border-primary"
            >
              <option value="">Every batch</option>
              {availableBatches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
          {availableKinds.length > 1 ? (
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-[10px] border border-border bg-secondary/60 px-2 py-1.5 text-xs font-semibold text-foreground cursor-pointer outline-none focus-visible:border-primary"
            >
              <option value="">Everything</option>
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Refresh activity"
            title="Refresh"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      ) : entries === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !grouped.length ? (
        <p className="text-sm text-muted-foreground">
          {kindFilter || batchFilter ? "Nothing matches that filter." : "No activity recorded yet."}
        </p>
      ) : (
        grouped.map((group) => (
          <div key={group.day} className="mb-4 last:mb-0">
            <p className="f-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground sticky top-0 bg-card py-1.5 z-[1]">
              {group.day}
            </p>
            {group.items.map((e) => {
              const kind = classify(e);
              const Icon = kind.icon;
              const target = targetOf(e);
              const profile = lookup(e.by);
              const navTarget = onJump ? navTargetFor(e, rows) : null;
              const Row = navTarget ? "button" : "div";
              return (
                <Row
                  key={e.id}
                  type={navTarget ? "button" : undefined}
                  onClick={navTarget ? () => onJump(navTarget) : undefined}
                  className={`flex gap-3 py-2.5 border-b border-border last:border-0 w-full text-left ${
                    navTarget ? "cursor-pointer hover:bg-secondary/40 -mx-2 px-2 rounded-lg transition-colors" : ""
                  }`}
                  title={
                    navTarget?.kind === "dress"
                      ? `Open ${navTarget.dress || "this dress"}`
                      : navTarget
                        ? "Jump to where this happened"
                        : undefined
                  }
                >
                  <div className="relative shrink-0">
                    <Avatar name={e.by} avatar={profile?.avatar} size={30} />
                    <span
                      className="absolute -bottom-1 -right-1 size-4 rounded-full grid place-items-center border-2 border-card"
                      style={{ background: kind.color }}
                      title={kind.label}
                    >
                      <Icon className="size-2" style={{ color: "var(--card)" }} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-x-1.5 gap-y-0.5 flex-wrap">
                      <span className="text-xs font-bold text-foreground">{e.by}</span>
                      <span className="text-xs text-muted-foreground">{verbFor(e, kind)}</span>
                      {target ? (
                        <span className="text-xs font-bold" style={{ color: kind.color }}>
                          {target}
                        </span>
                      ) : null}
                      <span className="text-[10.5px] ml-auto text-muted-foreground whitespace-nowrap">
                        {timeAgo(e.at)}
                      </span>
                    </div>
                    <ValueChange entry={e} />
                  </div>
                </Row>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
