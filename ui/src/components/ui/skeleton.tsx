import { cn } from "@/lib/utils"

/*
 * BOARED skeleton — no shimmer, no rounding. A flat ink-tinted block with a
 * single hairline rule. Reads as "this section is loading" the same way a
 * blank space in a printed page does.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative bg-foreground/[0.04] overflow-hidden",
        "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--boared-rule)]",
        "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--boared-rule)]",
        "boared-skeleton",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
