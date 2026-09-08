import { DressRow } from "./dress-table";

export function SearchResults({ rows, search, statusFilter, canEdit, sync, onFieldChange, onRetry }) {
  const term = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter && (r.status || "Not Started") !== statusFilter) return false;
    if (!term) return true;
    return [r.release, r.collection, r.dress].some((v) => String(v || "").toLowerCase().includes(term));
  });

  if (!filtered.length) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No dresses match — try a different search.
      </div>
    );
  }

  const byRel = {};
  filtered.forEach((r) => {
    const rel = r.release || "Unsorted";
    (byRel[rel] = byRel[rel] || []).push(r);
  });

  return Object.keys(byRel).map((rel) => {
    const cols = {};
    byRel[rel].forEach((r) => {
      const c = r.collection || "Unsorted";
      (cols[c] = cols[c] || []).push(r);
    });
    return (
      <div key={rel} className="mb-5">
        <h2 className="f-heading font-bold text-sm mb-2 text-foreground">{rel}</h2>
        {Object.keys(cols).map((c) => (
          <div key={c} className="rounded-[20px] border border-border bg-card mb-2.5 overflow-hidden">
            <div className="px-4 py-2.5 font-bold text-xs bg-secondary/40 text-foreground">{c}</div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full border-collapse">
                <tbody>
                  {cols[c].map((r) => (
                    <DressRow
                      key={r.id}
                      row={r}
                      disabled={!canEdit}
                      syncState={sync[`row:${r.id}`] || "idle"}
                      onFieldChange={onFieldChange}
                      onRetry={() => onRetry(r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  });
}
