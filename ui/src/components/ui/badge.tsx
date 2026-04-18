import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * BOARED badge — hard rectangle, mono caps, 1px border. Pills do not exist
 * in this brand. Use sparingly; the page already has plenty of mono labels.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center justify-center w-fit shrink-0 whitespace-nowrap",
    "font-mono uppercase tracking-[0.1em] text-[0.6rem] leading-none",
    "border px-1.5 py-1 gap-1",
    "[&>svg]:size-2.5 [&>svg]:pointer-events-none",
    "transition-[color,background-color,border-color]",
    "aria-invalid:border-destructive",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background border-foreground",
        secondary:
          "bg-transparent text-foreground border-[var(--boared-rule)]",
        destructive:
          "bg-destructive text-background border-destructive",
        outline:
          "bg-transparent text-foreground border-foreground",
        ghost:
          "bg-transparent text-muted-foreground border-transparent",
        link:
          "bg-transparent text-foreground border-transparent [a&]:hover:[text-decoration:underline] [a&]:hover:[text-decoration-color:var(--boared-acid)]",
        acid:
          "bg-[var(--boared-acid)] text-[var(--boared-acid-ink)] border-[var(--boared-acid)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
