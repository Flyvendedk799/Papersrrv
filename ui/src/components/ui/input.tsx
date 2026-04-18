import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * BOARED input — hairline rule below, no border above. Reads as a form field
 * in a printed application, not a SaaS box. Focus draws an acid underline.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "block w-full min-w-0 bg-transparent text-foreground",
        "font-mono text-[0.78rem] leading-tight tracking-tight",
        "border-0 border-b border-[var(--boared-rule)]",
        "px-0 py-2",
        "placeholder:text-muted-foreground placeholder:font-mono placeholder:text-[0.72rem] placeholder:tracking-[0.04em]",
        "outline-none transition-[border-color,box-shadow]",
        "focus-visible:border-[var(--boared-acid)] focus-visible:[box-shadow:0_1px_0_0_var(--boared-acid)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-mono file:uppercase file:tracking-[0.08em] file:text-foreground",
        "aria-invalid:border-destructive aria-invalid:focus-visible:[box-shadow:0_1px_0_0_var(--destructive)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
