import { cn } from "@/lib/utils";

// state: 'idle' | 'saving' | 'saved' | 'error'
export function SyncDot({ state = "idle", onRetry, title }) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "error"
      ? "Failed to save — click to retry"
      : state === "saved"
      ? "Saved"
      : title || "";
  return (
    <span
      className={cn(
        "sync-dot",
        state === "saving" && "sync-saving",
        state === "error" && "sync-error"
      )}
      title={label}
      onClick={state === "error" ? onRetry : undefined}
      role={state === "error" ? "button" : undefined}
    />
  );
}
