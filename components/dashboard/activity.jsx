"use client";

import { useEffect, useState } from "react";
import { Activity as ActivityIcon, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { fetchActivity } from "@/lib/api";

const FIELD_LABEL = {
  status: "changed status",
  comments: "edited comments",
  credits: "changed credit cost",
  revisions: "changed revisions",
  cost: "updated cost",
  note: "added a note",
  rename: "renamed a collection",
  role: "changed access",
};

function describe(entry) {
  const verb = FIELD_LABEL[entry.field] || `changed ${entry.field}`;
  let scopeLabel = entry.scope;
  if (entry.scope.startsWith("row:")) scopeLabel = "a dress";
  else if (entry.scope.startsWith("bulk:")) scopeLabel = entry.scope.replace("bulk:", "") + " (bulk)";
  else if (entry.scope.startsWith("cost:")) scopeLabel = entry.scope.split(":").slice(1).join(" · ");
  else if (entry.scope.startsWith("note:")) scopeLabel = entry.scope.replace("note:", "");
  else if (entry.scope.startsWith("collection:")) scopeLabel = entry.scope.replace("collection:", "");
  else if (entry.scope.startsWith("access:")) scopeLabel = entry.scope.replace("access:", "");
  return { verb, scopeLabel };
}

export function ActivityPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-primary" />
          <h2 className="f-heading font-bold text-sm text-foreground">Activity</h2>
          <span className="text-xs text-muted-foreground">who changed what, most recent first</span>
        </div>
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

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : entries === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !entries.length ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <div className="flex flex-col">
          {entries.map((e) => {
            const { verb, scopeLabel } = describe(e);
            return (
              <div key={e.id} className="flex gap-3 py-2.5 border-b border-border last:border-0">
                <div className="size-7 rounded-full flex items-center justify-center f-mono text-[10px] font-bold shrink-0 bg-primary/15 text-primary">
                  {(e.by || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground">{e.by}</span>
                    <span className="text-xs text-muted-foreground">
                      {verb} on <span className="font-semibold text-foreground">{scopeLabel}</span>
                    </span>
                    <span className="text-[10.5px] ml-auto text-muted-foreground">{timeAgo(e.at)}</span>
                  </div>
                  {e.oldValue || e.newValue ? (
                    <p className="text-sm mt-0.5 break-words text-muted-foreground">
                      {e.oldValue ? <span className="line-through opacity-70">{String(e.oldValue)}</span> : null}
                      {e.oldValue && e.newValue ? " → " : ""}
                      {e.newValue ? <span className="text-foreground">{String(e.newValue)}</span> : null}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
