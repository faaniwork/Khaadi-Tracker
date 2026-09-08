"use client";

import { signOut } from "next-auth/react";
import { Search, Sun, Moon, ArrowLeft, LogOut } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Crumb({ view, onBack }) {
  if (view.page === "overview") {
    return (
      <div>
        <h1 className="f-heading font-extrabold text-2xl sm:text-[28px] leading-tight text-foreground">
          Production Board
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          Khaadi × ImagineArt PDP shoot — every batch, tracked live
        </p>
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
      <h1 className="f-heading font-extrabold text-2xl sm:text-[28px] leading-tight text-foreground">
        {view.batch}
      </h1>
    </div>
  );
}

export function Header({
  view,
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
}) {
  const viewOnly = role !== "admin" && role !== "editor";
  return (
    <header className="sticky top-0 z-20 backdrop-blur border-b border-border bg-card/90">
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
            <span className="f-mono text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border-[1.5px] border-border bg-secondary text-muted-foreground">
              View only
            </span>
          ) : null}
          {syncSummary ? (
            <span
              onClick={syncSummary.onClick}
              className="f-mono text-[10.5px] font-bold px-2 py-1 rounded-lg cursor-pointer border-[1.5px] border-border"
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
          <Select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Delivered</option>
            <option>Needs Revision</option>
            <option>Discarded</option>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <div className="f-mono text-xs flex items-center gap-2 px-2.5 py-2 rounded-xl border-[1.5px] border-border bg-secondary/60">
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
