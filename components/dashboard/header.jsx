"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Search, Sun, Moon, ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PAGE_TITLES = {
  activity: ["Activity", "Who changed what, tracked in real time"],
  access: ["Access & roles", "Manage who can view, edit, or manage this board"],
};

export function Crumb({ view, onBack }) {
  if (view.page === "overview") {
    return (
      <div>
        <h1 className="f-heading text-xl sm:text-2xl font-semibold tracking-[-0.01em] leading-tight text-foreground">
          Production Board
        </h1>
      </div>
    );
  }
  // Outputs gets nothing here at all, batch or no batch - it draws its own
  // full breadcrumb and title inside OutputView regardless of how the
  // dashboard's own view state was set (arriving via a batch card sets
  // view.batch; arriving via the mode tab does not), so a title here could
  // only ever repeat or lag behind what OutputView already shows the moment
  // someone drills past the first level. See output-view.jsx's own crumb.
  if (view.page === "outputs") return null;
  if (PAGE_TITLES[view.page]) {
    const [title, sub] = PAGE_TITLES[view.page];
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold mb-1 text-primary"
        >
          <ArrowLeft className="size-4" /> All batches
        </button>
        <h1 className="f-heading text-xl sm:text-2xl font-semibold tracking-[-0.01em] leading-tight text-foreground">{title}</h1>
        <p className="text-sm mt-0.5 text-muted-foreground">{sub}</p>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold mb-1 text-primary"
      >
        <ArrowLeft className="size-4" /> All batches
      </button>
      <h1 className="f-heading text-xl sm:text-2xl font-semibold tracking-[-0.01em] leading-tight text-foreground">
        {view.batch}
      </h1>
    </div>
  );
}

/**
 * The two halves of the app.
 *
 * A filled segment rather than an underline: the underline sat directly
 * above the header's own border, so the top of every page had two
 * horizontal rules a few pixels apart doing the same job badly.
 *
 * Radii are nested deliberately - a 10px shell with 3px of padding wants a
 * 7px inner, or the gap between the two curves reads as a mistake. Same
 * 10px family as every input and select in the app rather than the pill it
 * used to be, so the header stops looking like a pile of lozenges that
 * wandered in from somewhere else.
 */
function ModeTabs({ mode, onNav }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", nav: "overview" },
    { id: "outputs", label: "Khaadi PDPs", nav: "outputs" },
  ];
  return (
    // The phone's bottom tab bar already switches Dashboard/Khaadi PDPs (see
    // MobileNav in nav.jsx) - keeping this here too just repeated the same
    // choice in two different places on the same screen.
    <nav className="hidden md:flex items-center h-8 p-[3px] rounded-[10px] bg-secondary/70">
      {tabs.map((t) => {
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onNav(t.nav)}
            aria-current={active ? "page" : undefined}
            className={`f-heading h-full px-3 rounded-[7px] text-[13px] font-semibold transition-colors duration-200 ${
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Every icon control in the header is the same object: 32px square, same
 * radius as the inputs beside it, no border of its own. They used to be
 * full circles of two different sizes with the sign-out one living inside
 * the account chip instead, which is most of why the row read as scattered
 * rather than composed.
 */
function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="size-8 shrink-0 rounded-[10px] grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Header({
  view,
  onNav,
  onBack,
  live,
  role,
  syncSummary,
  search,
  onSearch,
  theme,
  onToggleTheme,
  onRefresh,
  refreshing,
  user,
  myAvatar,
  onEditProfile,
}) {
  const viewOnly = role !== "admin" && role !== "editor";
  const mode = view.page === "outputs" ? "outputs" : "dashboard";
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  return (
    <header className="shrink-0 border-b border-border bg-background">
      {/* flex-wrap rather than a fixed height: fitting live badge, search,
          theme toggle and the account chip beside the mode tabs on a 375px
          phone in one line is not possible, and forcing it used to push the
          whole row past the edge of the screen (with html,body's overflow-x
          guard clipping it entirely) rather than dropping to a second line,
          so the theme toggle and sign-out button were simply unreachable on
          a phone. */}
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-7 xl:px-10 flex flex-wrap items-center gap-2 sm:gap-3 py-2.5 sm:h-14 sm:py-0">
        <ModeTabs mode={mode} onNav={onNav} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          {/* Status annotations, deliberately a different class of object
              than the controls beside them: smaller, pill-shaped, no fixed
              height. Only the informative states get to take up room -
              "Live" was a permanent green badge that said the same thing
              forever, so the one state actually worth interrupting someone
              for (offline) had to compete with it for attention. */}
          {live ? null : (
            <span
              title="Having trouble reaching the board"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
              style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}
            >
              <span className="size-1.5 rounded-full bg-current" />
              Offline
            </span>
          )}
          {viewOnly ? (
            <span className="hidden sm:inline-flex f-mono text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-border bg-secondary text-muted-foreground">
              View only
            </span>
          ) : null}
          {syncSummary ? (
            <button
              type="button"
              onClick={syncSummary.onClick}
              className="f-mono text-[10.5px] font-bold px-2.5 py-1 rounded-full transition-transform hover:scale-[1.03]"
              style={{
                background: syncSummary.kind === "error" ? "var(--destructive)" : "var(--warn)",
                color: syncSummary.kind === "error" ? "var(--destructive-foreground)" : "var(--warn-foreground)",
              }}
            >
              {syncSummary.text}
            </button>
          ) : null}

          {/* Widens on focus, so it is out of the way until it is being
              used and generous once it is. Exactly 32px tall and on the
              same 10px radius as every other control here - it used to be
              a full capsule of a slightly different height, which is most
              of what made this row read as mismatched. */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search dress, collection, batch"
              className="h-8 py-0 pl-8 pr-3 text-[13px] w-[132px] focus:w-[190px] sm:w-[190px] sm:focus:w-[260px] transition-[width] duration-300 ease-out"
            />
          </div>

          {/* One refresh, here, for the whole app - not a different small
              icon repeated on Activity, on a batch's own tools, in a
              dress's file panel, each doing the same "go get the current
              state again" underneath. */}
          {onRefresh ? (
            <IconButton label={refreshing ? "Refreshing" : "Refresh"} onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </IconButton>
          ) : null}

          <IconButton label="Toggle light and dark mode" onClick={onToggleTheme}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>

          {/* A hairline instead of another gap: the tools and the person
              using them are two different groups, and equal spacing between
              every single item is what made five controls read as five
              unrelated objects rather than two clusters. */}
          <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border mx-0.5" />

          <button
            type="button"
            onClick={onEditProfile}
            title="Change your name and picture"
            aria-label="Change your name and picture"
            className="h-8 shrink-0 flex items-center gap-2 pl-1 pr-1 md:pr-2.5 rounded-[10px] hover:bg-secondary transition-colors"
          >
            <Avatar name={user?.name || user?.email} avatar={myAvatar} size={24} />
            <span
              className="hidden md:inline text-[13px] font-semibold text-foreground max-w-[110px] truncate"
              title={user?.email}
            >
              {user?.name || user?.email}
            </span>
          </button>

          <IconButton label="Sign out" onClick={() => setConfirmingSignOut(true)}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out?"
        description="You'll need a fresh email code to get back to the board."
        confirmLabel="Sign out"
        onConfirm={() => signOut()}
        onCancel={() => setConfirmingSignOut(false)}
      />
      {view.page === "outputs" ? null : (
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-7 xl:px-10 pb-3 sm:pb-3.5">
          <Crumb view={view} onBack={onBack} />
        </div>
      )}
    </header>
  );
}
