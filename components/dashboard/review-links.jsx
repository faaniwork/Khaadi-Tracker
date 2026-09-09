"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, Check, Loader2, Ban } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { fetchReviewLinks, createReviewLink, revokeReviewLink } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Admin-only management of the client review links for one batch.
 *
 * A link is the whole credential, so the emphasis is on being able to revoke
 * one quickly: issue a separate link per client contact, and if one goes
 * astray, switch it off without disturbing anybody else's.
 */
export function ReviewLinksCard({ release, showToast }) {
  const [links, setLinks] = useState(null); // null = not loaded yet
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  // State is only written from then/catch, never synchronously in the effect
  // body, matching how the Activity tab loads.
  const load = useCallback(
    () =>
      fetchReviewLinks()
        .then((res) => {
          setLinks((res.links || []).filter((l) => l.release === release));
          setError("");
        })
        .catch((e) => setError(e.message || "Could not load review links")),
    [release]
  );

  useEffect(() => {
    let ignore = false;
    fetchReviewLinks()
      .then((res) => {
        if (ignore) return;
        setLinks((res.links || []).filter((l) => l.release === release));
        setError("");
      })
      .catch((e) => {
        if (!ignore) setError(e.message || "Could not load review links");
      });
    return () => {
      ignore = true;
    };
  }, [release]);

  const loading = links === null && !error;

  const urlFor = (token) =>
    typeof window === "undefined" ? `/review/${token}` : `${window.location.origin}/review/${token}`;

  const create = async () => {
    setCreating(true);
    try {
      await createReviewLink({ release, label: label.trim() });
      setLabel("");
      load();
    } catch (e) {
      showToast?.(e.message || "Could not create the link", "error");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      showToast?.("Could not copy — select the link and copy it by hand", "error");
    }
  };

  const revoke = async () => {
    const token = confirmRevoke;
    setConfirmRevoke(null);
    try {
      await revokeReviewLink({ token });
      load();
    } catch (e) {
      showToast?.(e.message || "Could not revoke the link", "error");
    }
  };

  const live = (links || []).filter((l) => !l.revokedAt);
  const revoked = (links || []).filter((l) => l.revokedAt);

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 mb-5 rise">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="size-4 text-primary" />
        <h3 className="f-heading font-bold text-sm text-foreground">Client review links</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Anyone with a link can approve or reject the images in this batch, with no sign-in. They
        cannot upload, delete, or see anything else. Give each client their own link so you can
        switch one off on its own.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Who is this for? e.g. Khaadi merch team"
          className="flex-1 min-w-[200px]"
          maxLength={80}
        />
        <Button size="sm" onClick={create} disabled={creating}>
          {creating ? "Creating…" : "Create link"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="py-4 grid place-items-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}

      {!loading && !live.length && !revoked.length ? (
        <p className="text-sm text-muted-foreground">No links for this batch yet.</p>
      ) : null}

      {live.map((l) => (
        <div
          key={l.token}
          className="flex items-center gap-2 flex-wrap py-2.5 border-b border-border last:border-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground truncate">{l.label || "Unlabelled link"}</p>
            <p className="f-mono text-[10.5px] text-muted-foreground truncate">{urlFor(l.token)}</p>
            <p className="text-[10.5px] text-muted-foreground">
              by {l.createdBy || "someone"} · {timeAgo(l.createdAt)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => copy(l.token)}>
            {copied === l.token ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied === l.token ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(l.token)}>
            <Ban className="size-3.5" /> Revoke
          </Button>
        </div>
      ))}

      {revoked.length ? (
        <details className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            {revoked.length} revoked link{revoked.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2">
            {revoked.map((l) => (
              <p key={l.token} className="text-xs text-muted-foreground py-1 line-through">
                {l.label || "Unlabelled link"} · revoked {timeAgo(l.revokedAt)}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmRevoke)}
        title="Revoke this review link?"
        description="Anyone using it will see a message saying the link is no longer active. Decisions already recorded through it are kept."
        confirmLabel="Revoke"
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
