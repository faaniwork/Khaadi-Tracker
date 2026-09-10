"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, Send, Check, Users } from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { fetchChatStatus, requestChatAccess, fetchChatMessages, sendChatMessage, grantChatAccess } from "@/lib/api";

const STATUS_POLL_MS = 20000;
const MESSAGES_POLL_MS = 4000;

/**
 * The board-wide chat, floating over every page the way a support widget
 * does on a marketing site - except this one is for the team and a client
 * to actually talk in, not a bot answering FAQs.
 *
 * Deliberately not gated by the board's own admin/editor/viewer/client
 * roles: an admin or editor always has it (see hasChatAccess in lib/db.js),
 * but a viewer or client only gets in once an admin grants it, so a random
 * person who merely has view access to the board never even learns this
 * conversation exists - the bubble itself only renders once the first
 * status check comes back, and until then nothing shows at all.
 */
export function ChatWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // null while loading, then 'none' | 'pending' | 'granted'
  const [isAdmin, setIsAdmin] = useState(false);
  const [requests, setRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const listRef = useRef(null);
  const statusTimer = useRef(null);
  const messagesTimer = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchChatStatus();
      setStatus(data.status);
      setIsAdmin(Boolean(data.isAdmin));
      setRequests(data.requests || []);
    } catch (e) {
      // A signed-out or transient failure here just means the bubble stays
      // hidden - nothing to surface to someone who was never shown it.
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchChatMessages();
      setMessages(data.messages || []);
    } catch (e) {
      // Quietly skipped - a dropped poll is not worth an error toast.
    }
  }, []);

  // Checked for everyone, quietly, so the bubble can appear the moment
  // access is granted without needing a page reload.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the initial poll of an external resource (the chat API), not state derived from props/state available at render time.
    loadStatus();
    statusTimer.current = setInterval(loadStatus, STATUS_POLL_MS);
    return () => clearInterval(statusTimer.current);
  }, [loadStatus]);

  useEffect(() => {
    if (!open || status !== "granted") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same as above, for the message poll.
    loadMessages();
    messagesTimer.current = setInterval(loadMessages, MESSAGES_POLL_MS);
    return () => clearInterval(messagesTimer.current);
  }, [open, status, loadMessages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const onRequest = async () => {
    setBusy(true);
    try {
      const data = await requestChatAccess();
      setStatus(data.status);
    } catch (e) {
      // The button stays put; trying again costs nothing.
    } finally {
      setBusy(false);
    }
  };

  const onSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft("");
    try {
      const { message } = await sendChatMessage({ text });
      setMessages((prev) => [...prev, message]);
    } catch (e) {
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const onGrant = async (email) => {
    try {
      await grantChatAccess({ targetEmail: email });
      setRequests((prev) => prev.filter((r) => r.email !== email));
    } catch (e) {
      // Left in the list - the admin can just try the button again.
    }
  };

  // Nothing at all until the first status check answers. A viewer who will
  // never be granted access should never see so much as an empty bubble
  // hinting that a chat exists.
  if (status === null) return null;

  const pendingCount = isAdmin ? requests.length : 0;

  return createPortal(
    <>
      {open ? (
        <div
          // Bottom offset clears the phone's own fixed tab bar (see
          // MobileNav in nav.jsx) below md, the same way the toast and the
          // bar itself do - the bubble is one tab-bar-height further down
          // again, so the panel sits just above the bubble in both cases.
          className="fixed z-50 right-5 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-24 flex flex-col w-[min(360px,calc(100vw-2.5rem))] h-[min(520px,calc(100vh-11rem))] rounded-[16px] border border-border bg-card shadow-xl overflow-hidden rise"
        >
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/40">
            <MessageCircle className="size-4 text-primary" />
            <h2 className="f-heading text-sm font-bold text-foreground">Team &amp; client chat</h2>
            {isAdmin && pendingCount ? (
              <button
                type="button"
                onClick={() => setShowRequests((s) => !s)}
                className="f-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "var(--warn)", color: "var(--warn-foreground)" }}
              >
                {pendingCount} waiting
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="ml-auto size-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {isAdmin && showRequests && requests.length ? (
            <div className="shrink-0 border-b border-border bg-secondary/20 px-3 py-2 flex flex-col gap-1.5 max-h-32 overflow-y-auto scrollbar-thin">
              {requests.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-xs">
                  <Users className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="min-w-0 truncate text-foreground" title={r.email}>
                    {r.name || r.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => onGrant(r.email)}
                    className="ml-auto shrink-0 flex items-center gap-1 rounded-full px-2 py-1 f-mono text-[10px] font-bold"
                    style={{ background: "var(--good)", color: "var(--good-foreground)" }}
                  >
                    <Check className="size-3" /> Grant
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {status === "granted" ? (
            <>
              <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-3">
                {messages.length ? (
                  messages.map((m) => {
                    const mine = m.email === user?.email;
                    return (
                      <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <span className="text-[10px] text-muted-foreground mb-0.5">
                          {mine ? "You" : m.name || m.email} · {timeAgo(m.at)}
                        </span>
                        <p
                          className="max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-snug break-words"
                          style={
                            mine
                              ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                              : { background: "var(--secondary)", color: "var(--foreground)" }
                          }
                        >
                          {m.text}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="m-auto text-xs text-muted-foreground">No messages yet - say hello.</p>
                )}
              </div>
              <form onSubmit={onSend} className="shrink-0 flex items-center gap-2 p-3 border-t border-border">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message the team…"
                  disabled={busy}
                  className="flex-1 min-w-0 rounded-full border border-border bg-secondary/60 px-3.5 py-2 text-sm outline-none focus-visible:border-primary disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  aria-label="Send"
                  className="size-9 rounded-full grid place-items-center bg-primary text-primary-foreground disabled:opacity-40 transition-transform active:scale-95"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          ) : status === "pending" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <MessageCircle className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Request sent</p>
              <p className="text-xs text-muted-foreground">
                An admin needs to approve you before you can see or send messages here.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <MessageCircle className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Ask to join the chat</p>
              <p className="text-xs text-muted-foreground">
                This is where the team and clients talk directly. An admin approves who gets in.
              </p>
              <button
                type="button"
                onClick={onRequest}
                disabled={busy}
                className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-4 py-2 disabled:opacity-50"
              >
                {busy ? "Requesting…" : "Request access"}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        // Lifted clear of the phone's fixed bottom tab bar below md - see
        // the matching comment on the toast in components/toast.jsx.
        className="fixed z-50 right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 size-14 rounded-full grid place-items-center bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        {!open && pendingCount ? (
          <span
            className="absolute -top-1 -right-1 size-5 rounded-full grid place-items-center f-mono text-[10px] font-bold"
            style={{ background: "var(--warn)", color: "var(--warn-foreground)" }}
          >
            {pendingCount}
          </span>
        ) : null}
      </button>
    </>,
    document.body
  );
}
