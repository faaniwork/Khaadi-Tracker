"use client";

import { cn } from "@/lib/utils";

export function Toast({ message, kind = "ok", visible }) {
  return (
    <div
      className={cn(
        // Lifted clear of the phone's fixed bottom tab bar (see MobileNav in
        // nav.jsx) below md, where bottom-6 alone would have sat a toast
        // right under it, half-hidden behind the bar's own background.
        "f-mono text-[12px] font-bold fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 z-50 rounded-full px-4 py-2.5 pointer-events-none transition-[opacity,transform] duration-300",
        kind === "error" ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background",
        visible ? "opacity-100 -translate-x-1/2 translate-y-0" : "opacity-0 -translate-x-1/2 translate-y-3"
      )}
    >
      {message}
    </div>
  );
}
