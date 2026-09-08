import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl f-heading font-bold transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20",
        ghost: "bg-secondary text-foreground border border-border hover:border-foreground/20",
        outline: "bg-transparent text-foreground border border-border hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "text-xs px-2.5 py-1.5",
        md: "text-sm px-3.5 py-2",
        lg: "text-sm px-5 py-2.5",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export function Button({ className, variant, size, ref, ...props }) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
