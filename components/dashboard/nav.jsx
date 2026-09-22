import { LayoutGrid, Ban, Check } from "lucide-react";
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
 *   complete   green ring with a checkmark, not the literal number "100" -
 *              same treatment the batch cards on Overview already use, so a
 *              finished batch reads as finished at a glance instead of as
 *              a number that happens to be 100
 *   0%         empty ring with NO number, since a bare "0" reads as noise
 *   anything   the usual progress ring with its percentage
 *
 * SELECTED used to be its own separate shape entirely: the ring inverted to
 * a solid filled circle with the number floating on top. At 0% that number
 * is deliberately blank (see above), which meant the selected batch's own
 * icon rendered as a plain, informationless blob - exactly the "weird"
 * circle this was reported as. The ring itself now stays IDENTICAL whether
 * selected or not - same shape, same colour, same checkmark-at-100 - so it
 * never loses information for being selected. Selection is instead a pill
 * of background colour behind the whole button, the same device the header's
 * own mode tabs already use for "which one is active" - one visual language
 * for the same question, not two.
 */
function NavRing({ pct, icon: Icon, discarded }) {
  // The sidebar no longer carries an "All" entry (see navItems in
  // dashboard.jsx), so an icon item is only ever Activity/Access now.
  if (Icon) {
    return (
      <div className="ring-chart" style={{ width: 44, height: 44, background: "var(--secondary)" }}>
        <Icon className="size-4 text-foreground" />
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
  const complete = rounded >= 100;
  return (
    <Ring
      pct={pct}
      size={44}
      color={complete ? "var(--good)" : undefined}
      label={complete ? <Check className="size-4" style={{ color: "var(--good)" }} /> : rounded ? String(rounded) : ""}
    />
  );
}

/**
 * "N new" - unread-count styling, not a status the way the batch rings are.
 * Clamped to 9+ so a busy board never grows a badge wide enough to crowd
 * the ring it sits on.
 */
function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full grid place-items-center f-mono text-[9.5px] font-bold leading-none shadow-sm"
      style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NavButton({ it, isActive, onNav }) {
  return (
    <button
      type="button"
      onClick={() => onNav(it.id)}
      aria-current={isActive ? "page" : undefined}
      title={
        it.badge
          ? `${it.label} - ${it.badge} new since you last looked`
          : it.discarded
            ? `${it.label} - all discarded`
            : it.label
      }
      className={`relative flex flex-col items-center gap-1.5 py-2.5 w-full rounded-xl transition-[transform,background-color] duration-200 hover:-translate-y-px ${
        isActive ? "bg-secondary" : ""
      }`}
    >
      <span className="relative">
        <NavRing id={it.id} pct={it.pct} icon={it.icon} discarded={it.discarded} />
        <NavBadge count={it.badge} />
      </span>
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
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] active:scale-95 transition-transform"
          >
            <span className="relative">
              <Icon
                className="size-[22px]"
                strokeWidth={isActive ? 2.4 : 2}
                style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
              />
              <NavBadge count={it.badge} />
            </span>
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
