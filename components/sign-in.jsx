"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignIn() {
  // A double-click (or an impatient second tap while the first OAuth
  // redirect is still starting) can race two sign-in requests and corrupt
  // the PKCE code-verifier cookie, which Google then rejects as a server
  // error. Disabling the button after the first click prevents that race.
  const [submitting, setSubmitting] = useState(false);

  const onClick = () => {
    if (submitting) return;
    setSubmitting(true);
    signIn("google").catch(() => setSubmitting(false));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[20px] border border-border bg-card p-8 text-center rise">
        <div
          className="size-12 rounded-2xl flex items-center justify-center f-heading font-extrabold text-xl mb-5 mx-auto text-white"
          style={{ background: "linear-gradient(135deg, var(--primary), var(--warn))" }}
        >
          K
        </div>
        <h1 className="f-heading font-extrabold text-xl text-foreground">Production Board</h1>
        <p className="text-sm mt-1.5 text-muted-foreground">
          Sign in with your Google account to view the Khaadi × ImagineArt PDP shoot tracker.
        </p>
        <Button className="mt-6 w-full" size="lg" onClick={onClick} disabled={submitting}>
          {submitting ? "Redirecting…" : "Continue with Google"}
        </Button>
        <p className="text-[11px] mt-4 text-muted-foreground">
          Everyone can view live. Ask an admin to add you as an editor in the sheet&rsquo;s Access tab to make changes.
        </p>
      </div>
    </div>
  );
}
