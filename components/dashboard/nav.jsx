import { LayoutGrid, Ban } from "lucide-react";
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
 *
 * SELECTED is the ring FILLING IN, rather than anything drawn beside it or
 * any weakening of its neighbours. Outline against solid is a difference you
 * cannot miss and it happens on the item itself, which is what the bar on
 * the sidebar's edge and the dimming of every other batch were both failing
 * to do: one added a shape that read as a glitch, the other made the
 * information harder to read to make one item stand out.
 */
function NavRing({ id, pct, icon: Icon, discarded, selected }) {
  const isIconItem = id === "overview" || Icon;

  if (selected) {
    const fill = discarded ? "var(--destructive)" : "var(--foreground)";
    const ink = discarded ? "var(--destructive-foreground)" : "var(--background)";
    const DisplayIcon = Icon || LayoutGrid;
    const rounded = Math.round(pct || 0);
    return (
      <div
        className="grid place-items-center rounded-full shrink-0"
        style={{ width: 44, height: 44, background: fill }}
      >
        {isIconItem ? (
          <DisplayIcon className="size-4" style={{ color: ink }} />
        ) : discarded ? (
          <Ban className="size-4" style={{ color: ink }} />
        ) : (
          <span className="f-mono font-bold" style={{ fontSize: 11, color: ink }}>
            {rounded ? String(rounded) : ""}
          </span>
        )}
      </div>
    );
  }

  if (isIconItem) {
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
      className="flex flex-col items-center gap-1.5 py-2.5 w-full rounded-xl transition-transform duration-200 hover:-translate-y-px"
    >
      <NavRing
        id={it.id}
        pct={it.pct}
        icon={it.icon}
        discarded={it.discarded}
        selected={isActive}
      />
      <span
        className={`f-mono text-[9.5px] uppercase tracking-wide ${
          isActive ? "font-bold text-foreground" : "font-semibold text-muted-foreground"
        } ${it.discarded ? "line-through" : ""}`}
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
      className="hidden md:flex flex-col items-center w-[84px] shrink-0 py-4 gap-1 rounded-[18px] border border-border h-full scrollbar-thin overflow-y-auto bg-sidebar"
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

/**
 * The phone's primary navigation: a fixed bottom tab bar, the way a phone
 * app is actually organised, rather than the sidebar's rail squeezed onto a
 * scrolling top strip. That strip used to carry every batch as its own pill
 * alongside Activity and Access, which is how the top of the screen ended up
 * a horizontally-scrolling wall of chips - not something anyone opens a
 * dashboard app expecting to navigate by.
 *
 * A handful of fixed destinations instead, the same ones the desktop header
 * and sidebar's app-section already treat as top-level: Overview, Khaadi
 * PDPs, Activity, and Access for an admin. Picking a batch happens by
 * opening it from a card, same as tapping into an album rather than having
 * every album pinned to a tab bar.
 */
export function MobileNav({ tabs, active, onNav }) {
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((it) => {
        const isActive = active.id === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onNav(it.id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] active:scale-95 transition-transform"
          >
            <Icon
              className="size-[22px]"
              strokeWidth={isActive ? 2.4 : 2}
              style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
            />
            <span
              className={`f-mono text-[10px] ${isActive ? "font-bold text-foreground" : "font-semibold text-muted-foreground"}`}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
