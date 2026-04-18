import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * BOARED textarea — same hairline-rule treatment as Input but with all
 * four sides drawn. Reads as a printed form box.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full min-h-16 bg-transparent text-foreground field-sizing-content",
        "font-mono text-[0.78rem] leading-relaxed tracking-tight",
        "border border-[var(--boared-rule)] px-3 py-2",
        "placeholder:text-muted-foreground placeholder:font-mono placeholder:text-[0.72rem] placeholder:tracking-[0.04em]",
        "outline-none transition-[border-color]",
        "focus-visible:border-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
