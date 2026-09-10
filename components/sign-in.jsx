"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

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
        <Logo width={150} className="mb-6" />
        <h1 className="f-heading font-extrabold text-xl text-foreground">Production Board</h1>
        <Button className="mt-6 w-full" size="lg" onClick={onClick} disabled={submitting}>
          {submitting ? "Redirecting…" : "Continue with Google"}
        </Button>
      </div>
    </div>
  );
}
