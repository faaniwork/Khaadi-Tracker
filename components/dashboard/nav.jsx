import { LayoutGrid } from "lucide-react";
import { shortRelease } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";

function NavRing({ id, active, pct }) {
  return id === "overview" ? (
    <div className="ring-chart" style={{ width: 44, height: 44, background: "var(--secondary)" }}>
      <LayoutGrid className="size-4 text-foreground" />
    </div>
  ) : (
    <Ring pct={pct} size={44} label={Math.round(pct) + ""} />
  );
}

export function Sidebar({ items, active, onNav }) {
  return (
    <aside className="hidden md:flex flex-col items-center w-[84px] shrink-0 py-5 gap-1 border-r border-border sticky top-0 h-screen scrollbar-thin overflow-y-auto bg-card">
      <div
        className="size-11 rounded-2xl flex items-center justify-center f-heading font-extrabold text-lg mb-4 text-white"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--warn))" }}
      >
        K
      </div>
      <div className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {items.map((it) => {
          const isActive = active.id === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onNav(it.id)}
              title={it.label}
              className="flex flex-col items-center gap-1 py-2 w-full rounded-xl transition-transform hover:-translate-y-px"
            >
              <NavRing id={it.id} active={isActive} pct={it.pct} />
              <span
                className={`f-mono text-[9.5px] font-bold uppercase tracking-wide ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function MobileNav({ items, active, onNav }) {
  return (
    <div className="md:hidden flex items-center gap-2 overflow-x-auto px-4 py-3 border-b border-border scrollbar-thin bg-card">
      {items.map((it) => {
        const isActive = active.id === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onNav(it.id)}
            className={`rounded-xl f-heading text-xs font-bold px-3 py-1.5 shrink-0 whitespace-nowrap ${
              isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground border border-border"
            }`}
          >
            {it.id === "overview" ? "All batches" : shortRelease(it.id)}
          </button>
        );
      })}
    </div>
  );
}
