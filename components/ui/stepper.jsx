import { Minus, Plus } from "lucide-react";

export function NumberStepper({ value, min = 1, max = 9, disabled, onChange }) {
  const n = Math.max(min, Math.min(max, Number(value) || min));

  const set = (next) => {
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== n) onChange(clamped);
  };

  return (
    <div
      className="inline-flex items-center rounded-[10px] border border-border bg-secondary/60 overflow-hidden"
      role="group"
      aria-label="Number of revisions"
    >
      <button
        type="button"
        disabled={disabled || n <= min}
        onClick={() => set(n - 1)}
        className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Decrease revisions"
      >
        <Minus className="size-3" />
      </button>
      <span className="f-mono text-xs font-bold w-6 text-center text-foreground tabular-nums">{n}</span>
      <button
        type="button"
        disabled={disabled || n >= max}
        onClick={() => set(n + 1)}
        className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Increase revisions"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
