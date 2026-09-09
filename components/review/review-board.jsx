"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, RefreshCw } from "lucide-react";
import { fetchReviewBatch, driveReview } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { FileTile } from "@/components/files/file-tile";
import { RejectDialog } from "@/components/files/reject-dialog";

const NAME_KEY = "khaadi-reviewer-name";

/**
 * The client-facing review view, reached by an unguessable per-batch link
 * with no Google sign-in.
 *
 * Because there is no account behind the link, the reviewer types their name
 * once and it rides along with every decision, so the Activity trail still
 * says who approved what rather than just "Client".
 */
export function ReviewBoard({ token, release, label }) {
  const [name, setName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [rejecting, setRejecting] = useState(null);
  const [rejectError, setRejectError] = useState("");
  const [savingReject, setSavingReject] = useState(false);
  const [notice, setNotice] = useState("");

  // Reading localStorage has to happen after mount, not in a state
  // initialiser: the server renders this page too, and a name pulled from
  // storage during the first render would not match the server's HTML.
  // That makes one extra render unavoidable here.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(saved);
        setNameConfirmed(true);
      }
    } catch {
      // Private browsing or blocked storage: they just type it again.
    }
  }, []);

  // State is written only from then/catch, never synchronously in the effect
  // body below.
  const fetchInto = useCallback(
    (reviewerName, isStale) =>
      fetchReviewBatch({ token, reviewerName })
        .then((res) => {
          if (isStale?.()) return;
          setData(res);
          setError("");
        })
        .catch((e) => {
          if (isStale?.()) return;
          setError(e.message || "Could not load this batch");
        })
        .finally(() => setRefreshing(false)),
    [token]
  );

  const load = useCallback(() => {
    setRefreshing(true);
    return fetchInto(name);
  }, [fetchInto, name]);

  useEffect(() => {
    if (!nameConfirmed) return undefined;
    let ignore = false;
    fetchInto(name, () => ignore);
    return () => {
      ignore = true;
    };
    // `name` is captured for attribution only; changing it mid-session should
    // not refetch, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameConfirmed, fetchInto]);

  const loading = (data === null && !error) || refreshing;

  const markBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const setReviewLocal = (fileId, review) =>
    setData((d) => (d ? { ...d, reviews: { ...d.reviews, [fileId]: review } } : d));

  const decide = async (dressId, file, decision, reason, feedbackText) => {
    markBusy(file.id, true);
    try {
      const res = await driveReview({
        dressId,
        fileId: file.id,
        fileName: file.name,
        decision,
        reason,
        feedbackText,
        auth: { token, reviewerName: name },
      });
      setReviewLocal(file.id, res.review);
      return true;
    } catch (e) {
      setNotice(e.message || "Could not save that");
      return false;
    } finally {
      markBusy(file.id, false);
    }
  };

  const totals = useMemo(() => {
    if (!data) return { files: 0, approved: 0, rejected: 0 };
    const files = data.dresses.reduce((n, d) => n + d.files.length, 0);
    let approved = 0;
    let rejected = 0;
    data.dresses.forEach((d) =>
      d.files.forEach((f) => {
        const s = data.reviews[f.id]?.status;
        if (s === "approved") approved++;
        else if (s === "rejected") rejected++;
      })
    );
    return { files, approved, rejected };
  }, [data]);

  if (!nameConfirmed) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 rise">
          <h1 className="f-heading text-lg font-bold text-foreground">Reviewing {release}</h1>
          {label ? <p className="text-sm text-muted-foreground mt-0.5">{label}</p> : null}
          <p className="text-sm text-muted-foreground mt-3">
            What should we call you? It gets attached to your approvals so the team knows who
            asked for what.
          </p>
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const clean = name.trim();
              if (!clean) return;
              try {
                localStorage.setItem(NAME_KEY, clean);
              } catch {
                // Not essential; the name still applies for this visit.
              }
              setName(clean);
              setNameConfirmed(true);
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
            />
            <Button type="submit" disabled={!name.trim()}>
              Start reviewing
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-4 flex items-center gap-3 flex-wrap">
          <Logo width={104} />
          <div className="min-w-0">
            <h1 className="f-heading font-bold text-base text-foreground truncate">{release}</h1>
            <p className="text-xs text-muted-foreground">
              {totals.files} image{totals.files === 1 ? "" : "s"} · {totals.approved} approved ·{" "}
              {totals.rejected} rejected
              {data?.isPreview ? " · preview" : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{name}</span>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-5 sm:px-8 py-6 pb-16">
        {notice ? (
          <div
            className="rounded-xl border p-3 mb-4 text-sm flex items-center gap-2"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
          >
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice("")} className="font-bold">
              Dismiss
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm" style={{ color: "var(--destructive)" }}>
              {error}
            </p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={load}>
              Try again
            </Button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="py-16 grid place-items-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}

        {data?.dresses?.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing has been uploaded for this batch yet. Check back shortly.
          </p>
        ) : null}

        {data?.dresses?.map((d) => (
          <section key={d.id} className="mb-6">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <h2 className="f-heading font-bold text-sm text-foreground">{d.dress}</h2>
              <span className="text-xs text-muted-foreground">{d.collection}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {d.files.length} image{d.files.length === 1 ? "" : "s"}
              </span>
            </div>

            {d.error ? (
              <p className="text-sm mb-2" style={{ color: "var(--destructive)" }}>
                {d.error}
              </p>
            ) : null}

            {d.files.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {d.files.map((f) => (
                  <FileTile
                    key={f.id}
                    file={f}
                    dressId={d.id}
                    token={token}
                    review={data.reviews[f.id]}
                    canWrite={false}
                    canReview
                    busy={busyIds.has(f.id)}
                    onApprove={(file) =>
                      decide(
                        d.id,
                        file,
                        data.reviews[file.id]?.status === "approved" ? "pending" : "approved"
                      )
                    }
                    onReject={(file) => {
                      setRejectError("");
                      setRejecting({ file, dressId: d.id });
                    }}
                  />
                ))}
              </div>
            ) : !d.error ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : null}
          </section>
        ))}

        {data && totals.files > 0 && totals.approved + totals.rejected === totals.files ? (
          <div
            className="rounded-2xl border p-4 flex items-center gap-2 justify-center"
            style={{ borderColor: "var(--good)", color: "var(--good)" }}
          >
            <Check className="size-4" />
            <span className="text-sm font-bold">
              That&apos;s everything reviewed. Thank you, the team can see your feedback already.
            </span>
          </div>
        ) : null}
      </main>

      <RejectDialog
        key={rejecting?.file?.id || "none"}
        open={Boolean(rejecting)}
        fileName={rejecting?.file?.name || ""}
        saving={savingReject}
        error={rejectError}
        onSubmit={async ({ reason, feedbackText }) => {
          setSavingReject(true);
          setRejectError("");
          const ok = await decide(
            rejecting.dressId,
            rejecting.file,
            "rejected",
            reason,
            feedbackText
          );
          setSavingReject(false);
          if (ok) setRejecting(null);
          else setRejectError("Could not save that. Try again.");
        }}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
