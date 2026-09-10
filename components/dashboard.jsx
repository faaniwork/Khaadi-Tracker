"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Activity, ShieldCheck, Sun, Moon, LogOut } from "lucide-react";
import { moodFor, mascotMessage, sortReleasesByRecency, RELEASE_LINKS } from "@/lib/constants";
import {
  fetchBoard,
  saveDressField,
  saveBulkStatus,
  saveCost,
  saveNote,
  syncToSheet,
  renameCollection as renameCollectionApi,
  driveResync,
  fetchProfiles,
  createBatch,
} from "@/lib/api";
import { burstConfetti } from "@/lib/confetti-bus";
import { ConfettiCanvas } from "@/components/confetti-canvas";
import { Toast } from "@/components/toast";
import { Sidebar, MobileNav } from "@/components/dashboard/nav";
import { Header } from "@/components/dashboard/header";
import { OverviewStats, OverviewChart, BatchCard } from "@/components/dashboard/overview";
import { BatchPage } from "@/components/dashboard/batch-page";
import { SearchResults } from "@/components/dashboard/search-results";
import { ActivityPage } from "@/components/dashboard/activity";
import { ProfileDialog } from "@/components/dashboard/profile-dialog";
import { AccessPage } from "@/components/dashboard/access";
import { OutputView } from "@/components/dashboard/output-view";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NewBatchDialog } from "@/components/dashboard/new-batch-dialog";

const POLL_MS = 15000;
const BATCHES_PER_PAGE = 9;

function releasesPresent(rows) {
  const set = [...new Set(rows.map((r) => r.release || "Unsorted"))];
  return sortReleasesByRecency(set);
}
function rowsFor(rows, rel) {
  return rows.filter((r) => (r.release || "Unsorted") === rel);
}
function collectionsFor(rows, rel) {
  const map = {};
  rowsFor(rows, rel).forEach((r) => {
    const c = r.collection || "Unsorted";
    (map[c] = map[c] || []).push(r);
  });
  return map;
}
/**
 * One batch's headline numbers. `allDiscarded` is what lets the UI tell a
 * dead batch apart from one that simply has not started: both sit at 0%
 * delivered, which is why they used to look identical.
 */
function batchStats(rows, rel) {
  const rr = rowsFor(rows, rel);
  const delivered = rr.filter((r) => r.status === "Delivered").length;
  const discarded = rr.filter((r) => r.status === "Discarded").length;
  return {
    rows: rr,
    total: rr.length,
    delivered,
    discarded,
    pct: rr.length ? (delivered / rr.length) * 100 : 0,
    complete: rr.length > 0 && delivered === rr.length,
    allDiscarded: rr.length > 0 && discarded === rr.length,
  };
}
/**
 * A batch's Drive folder link. RELEASE_LINKS only covers the batches that
 * predate the releases table, so a batch created on the board is looked up
 * there first.
 */
function driveLinkFor(rel, releaseFolders) {
  const folderId = releaseFolders?.[rel]?.folderId;
  if (folderId) return `https://drive.google.com/drive/folders/${folderId}`;
  return RELEASE_LINKS[rel] || "";
}

function costForRelease(costs, rel) {
  return Number(costs.batches?.[rel]) || 0;
}
function totalCost(costs) {
  const b = Object.values(costs.batches || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const c = Object.values(costs.collections || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return b + c;
}

export function Dashboard({ user }) {
  const [rows, setRows] = useState([]);
  const [costs, setCosts] = useState({ batches: {}, collections: {} });
  const [notes, setNotes] = useState({ batches: {} });
  const [role, setRole] = useState("viewer");
  const [live, setLive] = useState(true);
  const [view, setView] = useState({ page: "overview", batch: null });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedCols, setExpandedCols] = useState(() => new Set());
  const [sync, setSync] = useState({});
  const [toast, setToast] = useState({ message: "", kind: "ok", visible: false });
  const [theme, setTheme] = useState("light");
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [visibleBatches, setVisibleBatches] = useState(BATCHES_PER_PAGE);
  const [driveSync, setDriveSync] = useState({});
  const [resyncing, setResyncing] = useState("");
  const [profiles, setProfiles] = useState({ byEmail: {}, byName: {} });
  const [editingProfile, setEditingProfile] = useState(false);
  const [pendingBulk, setPendingBulk] = useState(null);
  const [addingBatch, setAddingBatch] = useState(false);
  const [mascot, setMascot] = useState({ active: false, message: "" });
  const [releaseFolders, setReleaseFolders] = useState({});

  const dirtyRows = useRef(new Set());
  const lastAttempt = useRef({});
  const dirtyCosts = useRef(new Set());
  const lastUpdatedAt = useRef({});
  const inFlight = useRef(false);
  const pollTimer = useRef(null);
  const mascotTimer = useRef(null);
  const toastTimer = useRef(null);
  const knownComplete = useRef(null);
  const knownHundred = useRef(null);

  const canEdit = role === "admin" || role === "editor";

  const showToast = useCallback((message, kind = "ok") => {
    setToast({ message, kind, visible: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), kind === "error" ? 3200 : 2000);
  }, []);

  const setDot = useCallback((key, state) => {
    setSync((s) => ({ ...s, [key]: state }));
  }, []);

  const detectCelebrations = useCallback((liveRows) => {
    const rels = releasesPresent(liveRows);
    const nowComplete = new Set(
      rels.filter((rel) => {
        const rr = rowsFor(liveRows, rel);
        return rr.length > 0 && rr.every((r) => r.status === "Delivered");
      })
    );
    const deliveredTotal = liveRows.filter((r) => r.status === "Delivered").length;
    const hundredMark = Math.floor(Math.min(deliveredTotal, 1000) / 100);
    if (knownComplete.current === null) {
      knownComplete.current = nowComplete;
      knownHundred.current = hundredMark;
      return;
    }
    nowComplete.forEach((rel) => {
      if (!knownComplete.current.has(rel)) {
        burstConfetti(window.innerWidth / 2, 90, 130);
        showToast(`🎉 ${rel} fully delivered!`);
      }
    });
    knownComplete.current = nowComplete;
    if (hundredMark > knownHundred.current) {
      burstConfetti(window.innerWidth / 2, 140, 90);
      showToast(`🎉 ${hundredMark * 100}+ dresses delivered!`);
    }
    knownHundred.current = hundredMark;
  }, [showToast]);

  const loadData = useCallback(
    async (silent) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await fetchBoard();
        const serverRows = data.rows || [];
        serverRows.forEach((r) => {
          if (!dirtyRows.current.has(r.id)) lastUpdatedAt.current[r.id] = r.updatedAt;
        });
        setRows((prev) => {
          const prevById = new Map(prev.map((r) => [r.id, r]));
          return serverRows.map((r) => (dirtyRows.current.has(r.id) ? prevById.get(r.id) || r : r));
        });
        setCosts((prev) => {
          const serverCosts = data.costs || { batches: {}, collections: {} };
          const merged = { batches: { ...serverCosts.batches }, collections: { ...serverCosts.collections } };
          dirtyCosts.current.forEach((k) => {
            const [scope, ...rest] = k.split(":");
            const key = rest.join(":");
            const bucket = scope === "release" ? "batches" : "collections";
            if (prev[bucket] && prev[bucket][key] != null) merged[bucket][key] = prev[bucket][key];
          });
          return merged;
        });
        setNotes(data.notes || { batches: {} });
        setRole(data.role || "viewer");
        setDriveSync(data.driveSync || {});
        setReleaseFolders(data.releaseFolders || {});
        setLive(true);
        detectCelebrations(serverRows);
      } catch (e) {
        console.error("load failed", e);
        setLive(false);
        if (!silent) showToast("Could not reach the sheet — retrying…", "error");
      } finally {
        inFlight.current = false;
      }
    },
    [detectCelebrations, showToast]
  );

  // Fetched once rather than on the board poll: avatars are a few kilobytes
  // each and almost never change, so re-sending them every 15 seconds would
  // be waste. State is set only inside then/catch, never in the effect body.
  useEffect(() => {
    let ignore = false;
    fetchProfiles()
      .then((data) => {
        if (!ignore) setProfiles({ byEmail: data.byEmail || {}, byName: data.byName || {} });
      })
      .catch((e) => console.error("profiles load failed", e));
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    loadData(false);
    pollTimer.current = setInterval(() => loadData(true), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) loadData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(pollTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadData]);

  useEffect(() => {
    // Reads browser-only state (localStorage / matchMedia) to sync React's
    // theme label with whatever the layout's blocking anti-flash script
    // already applied to the DOM — this can only happen after mount, so an
    // effect (not a lazy useState initializer, which would mismatch SSR) is
    // the correct place for it.
    let saved = null;
    try {
      saved = localStorage.getItem("khaadi-theme");
    } catch (e) {
      // ignore
    }
    const initial = saved || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with browser-only storage, not derivable during SSR render.
    setTheme(initial);
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const onToggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("khaadi-theme", next);
      } catch (e) {
        // ignore
      }
      return next;
    });
  }, []);

  // ---------- field / cost / note mutations ----------

  const fieldTimers = useRef({});

  const onFieldChange = useCallback(
    (folderId, field, value) => {
      if (!canEdit) {
        showToast("View-only access — ask an admin to make you an editor", "error");
        return;
      }
      const nextValue =
        field === "credits" ? Number(value) || 0 : field === "revisions" ? Math.max(1, Math.min(9, Number(value) || 1)) : value;
      dirtyRows.current.add(folderId);
      setRows((prev) =>
        prev.map((r) =>
          r.id === folderId
            ? { ...r, [field]: nextValue, updatedBy: user?.name || user?.email, updatedAt: Date.now() }
            : r
        )
      );
      const key = `row:${folderId}`;
      setDot(key, "saving");
      // Remember exactly what we're trying to save, so a retry (after a
      // network error or a conflict) resends this real edit instead of
      // silently re-saving something else and losing it.
      lastAttempt.current[folderId] = { field, value: nextValue };

      const commit = async () => {
        const baseline = lastUpdatedAt.current[folderId];
        try {
          const res = await saveDressField({
            folderId,
            field,
            value: nextValue,
            expectedUpdatedAt: baseline,
          });
          if (res && res.conflict) {
            setDot(key, "error");
            showToast("Someone else changed this dress — click the dot to retry and overwrite their change.", "error");
            return;
          }
          lastUpdatedAt.current[folderId] = res.updatedAt;
          dirtyRows.current.delete(folderId);
          delete lastAttempt.current[folderId];
          setDot(key, "saved");
          showToast("Saved" + (user?.name ? ` by ${user.name}` : ""));
          setTimeout(() => setDot(key, "idle"), 1200);
        } catch (e) {
          console.error("save failed", e);
          setDot(key, "error");
          showToast("Save failed — click the dot to retry", "error");
        }
      };

      if (field === "status") {
        commit();
      } else {
        clearTimeout(fieldTimers.current[key]);
        fieldTimers.current[key] = setTimeout(commit, 500);
      }
    },
    [canEdit, showToast, setDot, user]
  );

  // Retry a failed row save by resending whichever field/value actually
  // failed to save (tracked in lastAttempt), not just the row's status —
  // otherwise a failed comment/credit edit would look "saved" without ever
  // reaching the sheet.
  const retryRow = useCallback(
    async (folderId) => {
      const attempt = lastAttempt.current[folderId];
      const row = rows.find((r) => r.id === folderId);
      if (!attempt && !row) return;
      const field = attempt?.field || "status";
      const value = attempt ? attempt.value : row.status;
      const key = `row:${folderId}`;
      setDot(key, "saving");
      try {
        const res = await saveDressField({
          folderId,
          field,
          value,
          expectedUpdatedAt: undefined,
        });
        lastUpdatedAt.current[folderId] = res.updatedAt || Date.now();
        dirtyRows.current.delete(folderId);
        delete lastAttempt.current[folderId];
        setDot(key, "saved");
        showToast("Saved");
        setTimeout(() => setDot(key, "idle"), 1200);
      } catch (e) {
        setDot(key, "error");
        showToast("Save failed — click the dot to retry", "error");
      }
    },
    [rows, setDot, showToast]
  );

  const costTimers = useRef({});

  const onCostChange = useCallback(
    (scope, key, value) => {
      if (!canEdit) {
        showToast("View-only access — ask an admin to make you an editor", "error");
        return;
      }
      const n = Number(value) || 0;
      const bucket = scope === "release" ? "batches" : "collections";
      const dirtyKey = `${scope}:${key}`;
      dirtyCosts.current.add(dirtyKey);
      setCosts((prev) => ({ ...prev, [bucket]: { ...prev[bucket], [key]: n } }));
      const syncKey = `cost:${scope}:${key}`;
      setDot(syncKey, "saving");
      clearTimeout(costTimers.current[dirtyKey]);
      costTimers.current[dirtyKey] = setTimeout(async () => {
        try {
          await saveCost({ scope, key, value: n });
          dirtyCosts.current.delete(dirtyKey);
          setDot(syncKey, "saved");
          showToast("Cost updated");
          setTimeout(() => setDot(syncKey, "idle"), 1200);
        } catch (e) {
          console.error("cost save failed", e);
          setDot(syncKey, "error");
          showToast("Save failed — click the dot to retry", "error");
        }
      }, 600);
    },
    [canEdit, setDot, showToast]
  );

  const retryCost = useCallback(
    async (scope, key) => {
      const bucket = scope === "release" ? "batches" : "collections";
      const value = costs[bucket]?.[key] || 0;
      const syncKey = `cost:${scope}:${key}`;
      const dirtyKey = `${scope}:${key}`;
      setDot(syncKey, "saving");
      try {
        await saveCost({ scope, key, value });
        dirtyCosts.current.delete(dirtyKey);
        setDot(syncKey, "saved");
        showToast("Cost updated");
        setTimeout(() => setDot(syncKey, "idle"), 1200);
      } catch (e) {
        setDot(syncKey, "error");
        showToast("Save failed — click the dot to retry", "error");
      }
    },
    [costs, setDot, showToast]
  );

  // Asking first, because one pick here rewrites the status of every dress in
  // a batch or collection and there is no undo — a mis-click on a delivered
  // batch is both easy and expensive. The dialog names the count and the
  // scope, so it can be dismissed on sight when it is not what was meant.
  const requestBulkStatus = useCallback(
    (scope, key, status) => {
      const count =
        scope === "collection"
          ? rows.filter((r) => {
              const [rel, col] = key.split("␟");
              return (r.release || "Unsorted") === rel && (r.collection || "Unsorted") === col;
            }).length
          : rowsFor(rows, key).length;
      if (!count) return;
      const label = scope === "collection" ? key.split("␟")[1] : key;
      setPendingBulk({ scope, key, status, count, label });
    },
    [rows]
  );

  const applyBulkStatus = useCallback(async ({ scope, key, status }) => {
    let targets;
    if (scope === "collection") {
      const [rel, col] = key.split("␟");
      targets = rows.filter((r) => (r.release || "Unsorted") === rel && (r.collection || "Unsorted") === col);
    } else {
      targets = rowsFor(rows, key);
    }
    if (!targets.length) return;
    const stamp = user?.name || user?.email || "Someone";
    const now = Date.now();
    const ids = targets.map((r) => r.id);
    ids.forEach((id) => dirtyRows.current.add(id));
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, status, updatedBy: stamp, updatedAt: now } : r)));
    try {
      await saveBulkStatus({ folderIds: ids, status });
      ids.forEach((id) => {
        dirtyRows.current.delete(id);
        lastUpdatedAt.current[id] = now;
      });
      showToast(`Updated ${targets.length} dresses to ${status}`);
    } catch (e) {
      console.error("bulk save failed", e);
      showToast("Bulk save failed — try again", "error");
    }
  }, [rows, user, showToast]);

  const confirmBulkStatus = useCallback(() => {
    const pending = pendingBulk;
    setPendingBulk(null);
    if (pending) applyBulkStatus(pending);
  }, [pendingBulk, applyBulkStatus]);

  const onAddNote = useCallback(
    async (release, text) => {
      if (!canEdit) {
        showToast("View-only access — ask an admin to make you an editor", "error");
        return;
      }
      const stamp = user?.name || user?.email || "Someone";
      const entry = { id: "tmp" + Date.now(), text, by: stamp, at: Date.now() };
      setNotes((prev) => ({
        batches: { ...prev.batches, [release]: [...(prev.batches[release] || []), entry] },
      }));
      try {
        await saveNote({ release, text });
        showToast("Note added");
      } catch (e) {
        console.error("note save failed", e);
        showToast("Save failed — retry", "error");
      }
    },
    [canEdit, user, showToast]
  );

  const onToggleCol = useCallback((key) => {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const onRenameCollection = useCallback(
    async (release, oldName, newName) => {
      if (!canEdit) {
        showToast("View-only access — ask an admin to make you an editor", "error");
        return;
      }
      try {
        await renameCollectionApi({ release, oldName, newName });
        setRows((prev) =>
          prev.map((r) => (r.release === release && r.collection === oldName ? { ...r, collection: newName } : r))
        );
        showToast(`Renamed "${oldName}" to "${newName}"`);
        loadData(true);
      } catch (e) {
        console.error("rename collection failed", e);
        showToast(e.message || "Rename failed", "error");
      }
    },
    [canEdit, showToast, loadData]
  );

  const onSyncSheet = useCallback(async () => {
    if (sheetSyncing) return;
    setSheetSyncing(true);
    try {
      const res = await syncToSheet();
      showToast(`Sheet updated — ${res.rows} rows`);
    } catch (e) {
      console.error("sheet sync failed", e);
      showToast(e.message || "Sheet sync failed", "error");
    } finally {
      setSheetSyncing(false);
    }
  }, [sheetSyncing, showToast]);

  /**
   * Reconciles one batch against Drive, then reloads the board.
   *
   * Manual rather than automatic: a batch means dozens of Drive calls, so
   * running it on the 15-second poll would be slow and wasteful. This is the
   * button to press after reorganising folders in Drive.
   */
  const onResync = useCallback(
    async (release) => {
      if (resyncing) return;
      setResyncing(release);
      try {
        const res = await driveResync({ release });
        setDriveSync((prev) => ({
          ...prev,
          [release]: { at: res.syncedAt, by: "you", summary: res.text },
        }));
        const skipped = res.skipped?.length
          ? ` Skipped ${res.skipped.length} folder${res.skipped.length === 1 ? "" : "s"} that don't look like dresses.`
          : "";
        showToast(`Drive check done — ${res.text}.${skipped}`, "ok");
        await loadData(true);
      } catch (e) {
        showToast(e.message || "Could not read Drive", "error");
      } finally {
        setResyncing("");
      }
    },
    [resyncing, showToast, loadData]
  );

  /**
   * Builds a new batch's folders in Drive, then reads them straight back.
   *
   * The resync is a separate request on purpose — creating ~40 folders and
   * then walking the whole tree back is two jobs' worth of Drive calls, and
   * putting them in one request risks a timeout taking the folder creation
   * down with it. If this resync fails the folders still exist, and the
   * batch's own "Resync from Drive" button picks them up.
   */
  const onCreateBatch = useCallback(
    async ({ name, date, collections }) => {
      const res = await createBatch({ name, date, collections });
      setAddingBatch(false);
      showToast(
        `Created ${res.dresses} dress folder${res.dresses === 1 ? "" : "s"} in ${name} — reading them back…`,
        "ok"
      );
      try {
        await driveResync({ release: name });
      } catch (e) {
        console.error("resync after create failed", e);
        showToast(`Folders created, but reading them back failed: ${e.message}`, "error");
      }
      await loadData(true);
      setView({ page: "batch", batch: name });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [showToast, loadData]
  );

  const onMascotClick = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 70);
      const deliveredNow = rows.filter((r) => r.status === "Delivered").length;
      const mood = moodFor(Math.min(100, (deliveredNow / 1000) * 100));
      setMascot({ active: true, message: mascotMessage(mood), mood });
      clearTimeout(mascotTimer.current);
      mascotTimer.current = setTimeout(() => setMascot((m) => ({ ...m, active: false })), 2600);
    },
    [rows]
  );

  const onNav = useCallback((target) => {
    if (target === "overview") setView({ page: "overview", batch: null });
    else if (target === "activity" || target === "access" || target === "outputs") setView({ page: target, batch: null });
    // A batch name: browsing one goes to the images, which is what anyone
    // opening a batch actually came for. The editing side of a batch is a
    // step further in, via "Batch tools".
    else setView({ page: "outputs", batch: target });
    setSearch("");
    setStatusFilter("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ---------- derived data ----------
  const releases = useMemo(() => releasesPresent(rows), [rows]);
  const navItems = useMemo(() => {
    const items = [
      { id: "overview", label: "All" },
      ...releases.map((r) => {
        const s = batchStats(rows, r);
        return { id: r, label: r, pct: s.pct, discarded: s.allDiscarded };
      }),
      { id: "activity", label: "Activity", icon: Activity },
    ];
    if (role === "admin") items.push({ id: "access", label: "Access", icon: ShieldCheck });
    return items;
  }, [releases, rows, role]);

  const deliveredMood = moodFor(
    Math.min(100, (rows.filter((r) => r.status === "Delivered").length / 1000) * 100)
  );
  const mascotState = {
    ...mascot,
    mood: mascot.mood || deliveredMood,
    message: mascot.message || mascotMessage(deliveredMood),
  };

  const failedKeys = Object.entries(sync).filter(([, v]) => v === "error").map(([k]) => k);
  const savingCount = Object.values(sync).filter((s) => s === "saving").length;
  const retryAllFailed = useCallback(() => {
    failedKeys.forEach((key) => {
      if (key.startsWith("row:")) retryRow(key.slice(4));
      else if (key.startsWith("cost:")) {
        const [, scope, ...rest] = key.split(":");
        retryCost(scope, rest.join(":"));
      }
    });
  }, [failedKeys, retryRow, retryCost]);
  const syncSummary = failedKeys.length
    ? {
        text: `${failedKeys.length} change${failedKeys.length > 1 ? "s" : ""} not saved — click to retry`,
        kind: "error",
        onClick: retryAllFailed,
      }
    : savingCount
    ? { text: `Saving ${savingCount}…`, kind: "saving", onClick: undefined }
    : null;

  // A client account never sees the team's dashboard at all — no credits, no
  // revisions, no batch editing, none of the internal tracking chrome. Just
  // batches, collections, dresses, and the images inside them.
  if (role === "client") {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-border bg-card sticky top-0 z-10">
          <Logo width={40} />
          <span className="f-heading font-bold text-sm text-foreground">Khaadi PDPs</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="size-8 rounded-lg grid place-items-center border border-border text-muted-foreground hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg border border-border text-xs font-bold px-3 py-2 flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6">
          <OutputView rows={rows} showToast={showToast} canWrite={false} autoLatest />
        </main>
        <Toast {...toast} />
      </div>
    );
  }

  const searching = search.trim() || statusFilter;
  // A batch stays lit in the sidebar whether you are browsing its images or
  // in its tools.
  const activeNavId = view.batch || view.page;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={navItems} active={{ id: activeNavId }} onNav={onNav} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav items={navItems} active={{ id: activeNavId }} onNav={onNav} />
        <Header
          view={view}
          onNav={onNav}
          // Inside a batch, back means all batches; elsewhere, the overview.
          onBack={() => onNav(view.batch ? "outputs" : "overview")}
          live={live}
          role={role}
          syncSummary={syncSummary}
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          theme={theme}
          onToggleTheme={onToggleTheme}
          user={user}
          onSyncSheet={onSyncSheet}
          sheetSyncing={sheetSyncing}
          myAvatar={profiles.byEmail[(user?.email || "").toLowerCase()]?.avatar}
          onEditProfile={() => setEditingProfile(true)}
          canEdit={canEdit}
          onAddBatch={() => setAddingBatch(true)}
        />
        <main className="flex-1 max-w-[1280px] w-full mx-auto px-5 sm:px-8 py-6 pb-16">
          {searching ? (
            <SearchResults
              rows={rows}
              search={search}
              statusFilter={statusFilter}
              canEdit={canEdit}
              sync={sync}
              onFieldChange={onFieldChange}
              onRetry={retryRow}
            />
          ) : view.page === "overview" ? (
            <>
              <OverviewStats
                rows={rows}
                totalCost={totalCost(costs)}
                mascot={mascotState}
                onMascotClick={onMascotClick}
              />
              <OverviewChart releases={releases} rowsFor={(rel) => rowsFor(rows, rel)} />
              {releases.length ? (
                <>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
                    {releases.slice(0, visibleBatches).map((rel) => {
                      const rr = rowsFor(rows, rel);
                      const cols = collectionsFor(rows, rel);
                      const noteCount = (notes.batches && notes.batches[rel] || []).length;
                      return (
                        <BatchCard
                          key={rel}
                          rel={rel}
                          driveLink={driveLinkFor(rel, releaseFolders)}
                          rr={rr}
                          colCount={Object.keys(cols).length}
                          noteCount={noteCount}
                          cost={costForRelease(costs, rel)}
                          canEdit={canEdit}
                          sync={sync}
                          onNav={onNav}
                          onBulkStatus={requestBulkStatus}
                          onCostChange={onCostChange}
                          onCostRetry={retryCost}
                        />
                      );
                    })}
                  </div>
                  {releases.length > visibleBatches ? (
                    <div className="flex justify-center mt-5">
                      <button
                        type="button"
                        onClick={() => setVisibleBatches((n) => n + BATCHES_PER_PAGE)}
                        className="rounded-xl bg-secondary border border-border text-foreground text-xs px-4 py-2.5 font-bold"
                      >
                        Show more batches ({releases.length - visibleBatches} more)
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-[14px] border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  No batches yet.
                </div>
              )}
            </>
          ) : view.page === "activity" ? (
            <ActivityPage profiles={profiles} rows={rows} onNav={onNav} />
          ) : view.page === "access" ? (
            <AccessPage role={role} currentEmail={user?.email} showToast={showToast} />
          ) : view.page === "outputs" ? (
            <OutputView
              // Keyed by the batch so arriving at a different one starts at
              // that batch instead of wherever the last visit left off.
              key={view.batch || "all"}
              rows={rows}
              showToast={showToast}
              canWrite={canEdit}
              initialRelease={view.batch}
              onOpenBatchTools={
                canEdit ? (rel) => setView({ page: "batch", batch: rel }) : undefined
              }
            />
          ) : (
            <BatchPage
              // Remounted per batch on purpose. BatchPage keeps the open
              // dress viewer in its own state, and React reuses a component
              // in the same position across prop changes — so navigating from
              // one batch to another left the previous batch's dress open and
              // showing, which read as the page simply not changing.
              key={view.batch}
              rel={view.batch}
              driveLink={driveLinkFor(view.batch, releaseFolders)}
              rows={rowsFor(rows, view.batch)}
              collections={collectionsFor(rows, view.batch)}
              notesForBatch={notes.batches?.[view.batch]}
              cost={costForRelease(costs, view.batch)}
              canEdit={canEdit}
              sync={sync}
              expandedCols={expandedCols}
              onToggleCol={onToggleCol}
              onFieldChange={onFieldChange}
              onRetry={retryRow}
              onCostChange={onCostChange}
              onCostRetry={retryCost}
              onBulkStatus={requestBulkStatus}
              onAddNote={onAddNote}
              onRenameCollection={onRenameCollection}
              driveSync={driveSync[view.batch]}
              onResync={onResync}
              resyncing={resyncing === view.batch}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      <NewBatchDialog
        open={addingBatch}
        onClose={() => setAddingBatch(false)}
        onCreate={onCreateBatch}
      />
      <ConfirmDialog
        open={Boolean(pendingBulk)}
        title={
          pendingBulk
            ? `Set all ${pendingBulk.count} dress${pendingBulk.count === 1 ? "" : "es"} to ${pendingBulk.status}?`
            : ""
        }
        description={pendingBulk ? `This changes every dress in ${pendingBulk.label}.` : ""}
        confirmLabel={pendingBulk ? `Set ${pendingBulk.count} to ${pendingBulk.status}` : "Confirm"}
        onConfirm={confirmBulkStatus}
        onCancel={() => setPendingBulk(null)}
      />
      <Toast message={toast.message} kind={toast.kind} visible={toast.visible} />
      <ProfileDialog
        open={editingProfile}
        user={user}
        avatar={profiles.byEmail[(user?.email || "").toLowerCase()]?.avatar}
        onSaved={(profile) =>
          setProfiles((prev) => ({
            byEmail: { ...prev.byEmail, [profile.email]: profile },
            byName: profile.name ? { ...prev.byName, [profile.name]: profile } : prev.byName,
          }))
        }
        onClose={() => setEditingProfile(false)}
      />
      <ConfettiCanvas />
    </div>
  );
}
