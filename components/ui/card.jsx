import { cn } from "@/lib/utils";

export function Card({ className, hover, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-card text-card-foreground shadow-sm",
        hover && "card-hover transition-[box-shadow,border-color] duration-200",
        className
      )}
      {...props}
    />
  );
}
