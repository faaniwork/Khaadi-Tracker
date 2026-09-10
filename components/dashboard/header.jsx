"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Search, Sun, Moon, ArrowLeft, LogOut } from "lucide-react";
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
        <p className="text-sm mt-0.5 text-muted-foreground">
          Khaadi × ImagineArt PDP shoot - every batch, tracked live
        </p>
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
 * A filled pill rather than an underline: the underline sat directly above
 * the header's own border, so the top of every page had two horizontal rules
 * a few pixels apart doing the same job badly. A pill needs no rule at all.
 */
function ModeTabs({ mode, onNav }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", nav: "overview" },
    { id: "outputs", label: "Khaadi PDPs", nav: "outputs" },
  ];
  return (
    // The phone's bottom tab bar already switches Dashboard/Khaadi PDPs (see
    // MobileNav in nav.jsx) - keeping this pill here too just repeated the
    // same choice in two different places on the same screen.
    <nav className="hidden md:flex items-center gap-1 rounded-full bg-secondary/70 p-1">
      {tabs.map((t) => {
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onNav(t.nav)}
            aria-current={active ? "page" : undefined}
            className={`f-heading text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition-all duration-200 ${
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
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {/* A bare green dot next to a search box was a pixel nobody could
              interpret. It says what it means now, and only takes space
              worth taking when something is actually wrong. */}
          <span
            title={live ? "Live: the board is in sync" : "Having trouble reaching the board"}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground"
          >
            <span
              className={`size-1.5 rounded-full ${live ? "animate-pulse" : ""}`}
              style={{ background: live ? "var(--good)" : "var(--destructive)" }}
            />
            {live ? "Live" : "Offline"}
          </span>
          {viewOnly ? (
            <span className="f-mono text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-border bg-secondary text-muted-foreground">
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
              used and generous once it is. */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search dress, collection, batch"
              className="pl-9 pr-3 py-1.5 rounded-full w-[130px] focus:w-[190px] sm:w-[190px] sm:focus:w-[260px] transition-[width] duration-300 ease-out"
            />
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            title="Toggle theme"
            className="size-8 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          <div className="flex items-center gap-2 pl-1 pr-1 py-1 rounded-full border border-border bg-secondary/50">
            <button
              type="button"
              onClick={onEditProfile}
              title="Change your picture"
              aria-label="Change your picture"
              className="rounded-full transition-transform hover:scale-105"
            >
              <Avatar name={user?.name || user?.email} avatar={myAvatar} size={26} />
            </button>
            <span
              className="hidden md:inline text-xs font-semibold text-foreground max-w-[110px] truncate"
              title={user?.email}
            >
              {user?.name || user?.email}
            </span>
            <button
              type="button"
              onClick={() => setConfirmingSignOut(true)}
              title="Sign out"
              aria-label="Sign out"
              className="size-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
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
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-7 xl:px-10 pb-4 sm:pb-5">
          <Crumb view={view} onBack={onBack} />
        </div>
      )}
    </header>
  );
}
