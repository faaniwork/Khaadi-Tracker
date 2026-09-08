import { cn } from "@/lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "rounded-[10px] border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-primary disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "appearance-none rounded-[10px] border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-primary cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239892b0%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center] bg-[length:14px] pr-8",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
