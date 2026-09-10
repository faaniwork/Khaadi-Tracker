import { LayoutGrid, Ban } from "lucide-react";
import { shortRelease } from "@/lib/constants";
import { Ring } from "@/components/ui/ring";
import { Logo } from "@/components/ui/logo";

/**
 * A batch's ring.
 *
 * Three states worth telling apart, because two of them used to look the
 * same. A batch where everything was discarded and a batch where nothing has
 * been delivered yet both drew an empty ring with "0" in it, which made a
 * dead batch look like a batch that had not started.
 *
 *   discarded  solid red ring with a slash, and the label struck through
 *   0%         empty ring with NO number, since a bare "0" reads as noise
 *   anything   the usual progress ring with its percentage
 */
function NavRing({ id, pct, icon: Icon, discarded }) {
  if (id === "overview" || Icon) {
    const DisplayIcon = Icon || LayoutGrid;
    return (
      <div className="ring-chart" style={{ width: 44, height: 44, background: "var(--secondary)" }}>
        <DisplayIcon className="size-4 text-foreground" />
      </div>
    );
  }
  if (discarded) {
    return (
      <Ring
        pct={100}
        size={44}
        color="var(--destructive)"
        label={<Ban className="size-4" style={{ color: "var(--destructive)" }} />}
      />
    );
  }
  const rounded = Math.round(pct || 0);
  return <Ring pct={pct} size={44} label={rounded ? String(rounded) : ""} />;
}

function NavButton({ it, isActive, onNav }) {
  return (
    <button
      type="button"
      onClick={() => onNav(it.id)}
      aria-current={isActive ? "page" : undefined}
      title={it.discarded ? `${it.label} - all discarded` : it.label}
      className={`relative flex flex-col items-center gap-1.5 py-2.5 w-full rounded-xl transition-colors duration-200 ${
        isActive ? "bg-secondary" : "hover:bg-secondary/50"
      }`}
    >
      {/* Which batch you are looking at was carried entirely by a colour
          change on a 9.5px label, which is to say it was not carried at all.
          A filled pill and a bar on the sidebar's own edge say it from
          across the room. */}
      {isActive ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-foreground"
        />
      ) : null}
      <NavRing id={it.id} pct={it.pct} icon={it.icon} discarded={it.discarded} />
      <span
        className={`f-mono text-[9.5px] font-bold uppercase tracking-wide transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground"
        } ${it.discarded ? "line-through opacity-70" : ""}`}
      >
        {it.label}
      </span>
    </button>
  );
}

export function Sidebar({ items, active, onNav }) {
  // Activity and Access are app-level views, not batches. Sitting in the same
  // scrolling column as the batch rings made them read as two more batches,
  // so they get pinned to the bottom behind a divider.
  const batchItems = items.filter((it) => !it.icon);
  const appItems = items.filter((it) => it.icon);

  return (
    <aside
      style={{ "--ring-hole": "var(--sidebar)" }}
      className="hidden md:flex flex-col items-center w-[84px] shrink-0 py-5 gap-1 border-r border-border sticky top-0 h-screen scrollbar-thin overflow-y-auto bg-sidebar"
    >
      <Logo width={64} className="mb-4" />
      <div className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {batchItems.map((it) => (
          <NavButton key={it.id} it={it} isActive={active.id === it.id} onNav={onNav} />
        ))}
      </div>
      {appItems.length ? (
        <div className="flex flex-col items-center gap-1 w-full px-2 pt-3 mt-2 border-t border-border shrink-0">
          {appItems.map((it) => (
            <NavButton key={it.id} it={it} isActive={active.id === it.id} onNav={onNav} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export function MobileNav({ items, active, onNav }) {
  return (
    <div className="md:hidden flex items-center gap-2 overflow-x-auto px-4 py-3 border-b border-border scrollbar-thin bg-card">
      {items.map((it) => {
        const isActive = active.id === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onNav(it.id)}
            className={`rounded-xl f-heading text-xs font-bold px-3 py-1.5 shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
              isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground border border-border"
            } ${it.discarded && !isActive ? "line-through opacity-70" : ""}`}
            style={
              it.discarded && !isActive
                ? { borderColor: "var(--destructive)", color: "var(--destructive)" }
                : undefined
            }
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {it.id === "overview" ? "All batches" : Icon ? it.label : shortRelease(it.id)}
          </button>
        );
      })}
    </div>
  );
}
