"use client";

import { signOut } from "next-auth/react";
import { Search, Sun, Moon, ArrowLeft, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const PAGE_TITLES = {
  activity: ["Activity", "Who changed what, tracked in real time"],
  access: ["Access & roles", "Manage who can view, edit, or manage this board"],
  outputs: ["Khaadi PDPs", "Batches, collections and dresses - the images, nothing else"],
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
  // Browsing inside a batch: name the batch, not the section. "Khaadi PDPs"
  // is true but useless once you are three levels into one.
  if (view.page === "outputs" && view.batch) {
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
  if (PAGE_TITLES[view.page]) {
    const [title, sub] = PAGE_TITLES[view.page];
    // Outputs is a sibling mode, not a page nested under the dashboard — the
    // mode tabs above already do the job a "back" link would, so it does
    // not get one.
    return (
      <div>
        {view.page !== "outputs" ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-semibold mb-1 text-primary"
          >
            <ArrowLeft className="size-4" /> All batches
          </button>
        ) : null}
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
    <nav className="flex items-center gap-1 rounded-full bg-secondary/70 p-1">
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
  return (
    <header className="sticky top-0 z-20 backdrop-blur border-b border-border bg-background/85">
      <div className="w-full max-w-[1600px] mx-auto px-6 lg:px-10 flex items-center gap-3 h-14">
        <ModeTabs mode={mode} onNav={onNav} />
        <div className="ml-auto flex items-center gap-2">
          <span
            title={live ? "Synced with the Tracker sheet" : "Having trouble reaching the sheet"}
            className="size-2.5 rounded-full shrink-0"
            style={{ background: live ? "var(--good)" : "var(--destructive)" }}
          />
          {viewOnly ? (
            <span className="f-mono text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border border-border bg-secondary text-muted-foreground">
              View only
            </span>
          ) : null}
          {syncSummary ? (
            <span
              onClick={syncSummary.onClick}
              className="f-mono text-[10.5px] font-bold px-2 py-1 rounded-lg cursor-pointer border border-border"
              style={{
                background: syncSummary.kind === "error" ? "var(--destructive)" : "var(--warn)",
                color: syncSummary.kind === "error" ? "var(--destructive-foreground)" : "var(--warn-foreground)",
              }}
            >
              {syncSummary.text}
            </span>
          ) : null}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search dress, collection, batch…"
              className="pl-9 pr-3 py-2 w-[220px]"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <div className="f-mono text-xs flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-border bg-secondary/60">
            <button
              type="button"
              onClick={onEditProfile}
              title="Change your picture"
              aria-label="Change your picture"
              className="rounded-full transition-transform hover:scale-105"
            >
              <Avatar name={user?.name || user?.email} avatar={myAvatar} size={26} />
            </button>
            <span className="font-semibold text-foreground max-w-[110px] truncate" title={user?.email}>
              {user?.name || user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              title="Sign out"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div className="w-full max-w-[1600px] mx-auto px-6 lg:px-10 pb-5">
        <Crumb view={view} onBack={onBack} />
      </div>
    </header>
  );
}
