import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * BOARED tabs — section editor pattern. There is no pill background. Tabs
 * sit on a hairline rule; the active tab paints an acid bar above it. Mono
 * caps with wide tracking, like newspaper section flags.
 */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list inline-flex w-fit items-stretch text-muted-foreground",
    "border-b border-[var(--boared-rule)] gap-6",
    "group-data-[orientation=horizontal]/tabs:h-9",
    "group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:border-b-0 group-data-[orientation=vertical]/tabs:border-r group-data-[orientation=vertical]/tabs:gap-3",
  ].join(" "),
  {
    variants: {
      variant: {
        // The default and the "line" variant are now identical — there's
        // only one tabs aesthetic in Boared. The variant prop is preserved
        // for backwards compatibility with callers but no longer matters.
        default: "",
        line: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
        "font-mono uppercase tracking-[0.12em] text-[0.66rem] leading-none",
        "px-0 pb-2 pt-1 border-0",
        "text-muted-foreground hover:text-foreground",
        "transition-colors outline-none",
        "focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-4",
        "disabled:pointer-events-none disabled:opacity-40",
        "data-[state=active]:text-foreground",
        // Active = thick acid underline anchored at the parent's bottom rule
        "after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[3px] after:bg-[var(--boared-acid)] after:opacity-0",
        "data-[state=active]:after:opacity-100",
        // Vertical orientation tweaks
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        "group-data-[orientation=vertical]/tabs:py-2 group-data-[orientation=vertical]/tabs:px-3 group-data-[orientation=vertical]/tabs:pb-2",
        "group-data-[orientation=vertical]/tabs:after:left-auto group-data-[orientation=vertical]/tabs:after:-right-px group-data-[orientation=vertical]/tabs:after:bottom-auto group-data-[orientation=vertical]/tabs:after:top-0 group-data-[orientation=vertical]/tabs:after:h-full group-data-[orientation=vertical]/tabs:after:w-[3px]",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
