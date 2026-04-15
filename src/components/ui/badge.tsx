import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-muted/80 text-foreground",
        running: "border-primary/25 bg-primary/[0.08] text-primary",
        input: "border-amber-200/90 bg-amber-50 text-amber-900",
        review: "border-sky-200/90 bg-sky-50 text-sky-900",
        destructive: "border-destructive/25 bg-destructive/[0.08] text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
