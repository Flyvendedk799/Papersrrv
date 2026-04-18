import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * BOARED button — hard-edged editorial.
 * No rounding anywhere. Mono caps. 1px borders. Hover = invert + acid underline.
 *
 * Variants:
 *   default     — solid ink rectangle on paper. The press button.
 *   outline     — paper rectangle with ink border. The default chrome action.
 *   ghost       — borderless mono caps. Toolbar / inline.
 *   destructive — blood-red rectangle.
 *   secondary   — paper-2 rectangle, ink text. Subtle.
 *   link        — text only with acid underline on hover.
 *   acid        — sulfur accent rectangle. Use sparingly — for the one CTA per page.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0",
    "font-mono uppercase tracking-[0.08em] text-[0.72rem] leading-none",
    "border transition-[color,background-color,border-color,opacity] duration-150",
    "outline-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boared-acid)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
    "aria-invalid:border-destructive",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background border-foreground hover:bg-background hover:text-foreground",
        destructive:
          "bg-destructive text-background border-destructive hover:bg-background hover:text-destructive",
        outline:
          "bg-transparent text-foreground border-foreground hover:bg-foreground hover:text-background",
        secondary:
          "bg-[var(--boared-paper-2)] text-foreground border-[var(--boared-paper-2)] hover:border-foreground",
        ghost:
          "bg-transparent text-foreground border-transparent hover:bg-foreground/5",
        link:
          "border-transparent bg-transparent text-foreground hover:text-foreground underline-offset-[6px] hover:[text-decoration:underline] hover:[text-decoration-color:var(--boared-acid)] hover:[text-decoration-thickness:3px]",
        acid:
          "bg-[var(--boared-acid)] text-[var(--boared-acid-ink)] border-[var(--boared-acid)] hover:bg-foreground hover:text-background hover:border-foreground",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        xs: "h-6 px-2 text-[0.6rem] gap-1 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3 text-[0.66rem] gap-1.5 has-[>svg]:px-2.5",
        lg: "h-11 px-6 text-[0.78rem] has-[>svg]:px-5",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
