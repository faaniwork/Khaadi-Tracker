"use client";

import { signOut } from "next-auth/react";
import { Search, Sun, Moon, ArrowLeft, LogOut, FileSpreadsheet, Plus } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const PAGE_TITLES = {
  activity: ["Activity", "Who changed what, tracked in real time"],
  access: ["Access & roles", "Manage who can view, edit, or manage this board"],
  outputs: ["Khaadi PDPs", "Batches, collections and dresses — the images, nothing else"],
};

export function Crumb({ view, onBack }) {
  if (view.page === "overview") {
    return (
      <div>
        <h1 className="f-heading text-xl sm:text-2xl font-semibold tracking-[-0.01em] leading-tight text-foreground">
          Production Board
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          Khaadi × ImagineArt PDP shoot — every batch, tracked live
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
 * The two halves of the app, as an actual tab pair rather than one more icon
 * lost in the sidebar's stack of batch rings. Underlined, not boxed — this
 * sits above everything else here, so it reads as a mode switch, not a
 * page action.
 */
function ModeTabs({ mode, onNav }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", nav: "overview" },
    { id: "outputs", label: "Khaadi PDPs", nav: "outputs" },
  ];
  return (
    <nav className="flex items-center gap-6 -mb-px">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onNav(t.nav)}
          className={`f-heading text-sm font-medium pb-2.5 border-b-2 transition-colors ${
            mode === t.id ? "text-foreground" : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
          style={mode === t.id ? { borderColor: "var(--primary)" } : undefined}
        >
          {t.label}
        </button>
      ))}
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
  statusFilter,
  onStatusFilter,
  theme,
  onToggleTheme,
  user,
  onSyncSheet,
  sheetSyncing,
  myAvatar,
  onEditProfile,
  canEdit,
  onAddBatch,
}) {
  const viewOnly = role !== "admin" && role !== "editor";
  const mode = view.page === "outputs" ? "outputs" : "dashboard";
  return (
    <header className="sticky top-0 z-20 backdrop-blur border-b border-border bg-card/90">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 pt-5 sm:pt-6 border-b border-border/60">
        <ModeTabs mode={mode} onNav={onNav} />
      </div>
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Crumb view={view} onBack={onBack} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          {mode === "outputs" ? null : (
            <Select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option>Not Started</option>
              <option>In Progress</option>
              <option>Delivered</option>
              <option>Needs Revision</option>
              <option>Discarded</option>
            </Select>
          )}
          {role === "admin" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSyncSheet}
              disabled={sheetSyncing}
              aria-label="Sync a snapshot to the Google Sheet"
              title="Sync a snapshot to the Google Sheet"
            >
              <FileSpreadsheet className={`size-4 ${sheetSyncing ? "animate-pulse" : ""}`} />
            </Button>
          ) : null}
          {canEdit && onAddBatch ? (
            <Button size="sm" onClick={onAddBatch}>
              <Plus className="size-3.5" /> Add batch
            </Button>
          ) : null}
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
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
