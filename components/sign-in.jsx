"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

/**
 * Email, then the code that email just received - the only way in now.
 * Google sign-in was tried as a fallback but never actually served "anyone"
 * the way this needs to: the project's OAuth consent screen stays in
 * Google's Testing status (moving it to Production means a real, multi-week
 * verification review), so Google rejected anyone not on a hand-maintained
 * test-user list outright, regardless of anything this app's own code did.
 *
 * A brand new email works exactly like a returning one: it gets a code and
 * signs in as 'viewer' the first time. Nothing here decides who can do what
 * - that's still the Access page, same as always.
 */
export function SignIn() {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async (e) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) {
      setError("Enter a real email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || "Could not send a code");
      setStep("code");
    } catch (err) {
      setError(err.message || "Could not send a code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await signIn("email-code", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        redirect: false,
      });
      if (res?.error) {
        setError("That code is wrong or has expired. Check your email, or send a new one.");
        setBusy(false);
        return;
      }
      // A hard reload rather than a router push: the whole app tree above
      // this reads the session from the server on first render (see
      // app/page.js), so a client-side navigation would still show the
      // sign-in screen until the next full load anyway.
      window.location.reload();
    } catch (err) {
      setError(err.message || "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[14px] border border-border bg-card p-8 text-center rise">
        <Logo width={150} className="mb-6" />
        <h1 className="f-heading font-extrabold text-xl text-foreground">Production Board</h1>

        {step === "email" ? (
          <form onSubmit={requestCode} className="mt-6 flex flex-col gap-3">
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="text-center"
              disabled={busy}
            />
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Sending…" : "Send me a code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground -mt-1">
              Code sent to <span className="font-semibold text-foreground">{email}</span>
            </p>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="text-center f-mono tracking-[0.3em]"
              disabled={busy}
            />
            <Button type="submit" size="lg" disabled={busy || code.length < 6}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              disabled={busy}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        {error ? (
          <p className="mt-3 text-xs" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
