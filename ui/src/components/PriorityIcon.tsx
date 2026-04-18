import { useState } from "react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/*
 * BOARED priority — typographic degree mark.
 *
 * Replaces the SaaS pattern of arrow / bar / triangle priority glyphs with
 * a numeric degree marker — the way a register clerk would rank a piece of
 * correspondence. Critical gets the only acid tint.
 *
 *   1°  critical
 *   2°  high
 *   3°  medium
 *   4°  low
 */

const PRIORITY_DEGREE: Record<string, string> = {
  critical: "1°",
  high: "2°",
  medium: "3°",
  low: "4°",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const allPriorities = ["critical", "high", "medium", "low"];

interface PriorityIconProps {
  priority: string;
  onChange?: (priority: string) => void;
  className?: string;
  showLabel?: boolean;
}

function DegreeMark({ priority, className }: { priority: string; className?: string }) {
  const code = PRIORITY_DEGREE[priority] ?? "—";
  const isCritical = priority === "critical";
  const isHigh = priority === "high";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none",
        "min-w-[18px] font-mono text-[0.66rem] tabular-nums leading-none tracking-tight",
        isCritical && "text-[var(--boared-acid)]",
        isHigh && "text-foreground",
        !isCritical && !isHigh && "text-muted-foreground",
        className,
      )}
      aria-label={PRIORITY_LABEL[priority] ?? priority}
    >
      {code}
    </span>
  );
}

export function PriorityIcon({ priority, onChange, className, showLabel }: PriorityIconProps) {
  const [open, setOpen] = useState(false);
  const label = PRIORITY_LABEL[priority] ?? priority;

  const mark = <DegreeMark priority={priority} className={className} />;

  if (!onChange) {
    return showLabel ? (
      <span className="inline-flex items-center gap-2">
        {mark}
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-foreground">{label}</span>
      </span>
    ) : (
      mark
    );
  }

  const trigger = showLabel ? (
    <button
      type="button"
      className="inline-flex items-center gap-2 cursor-pointer hover:bg-foreground/[0.04] px-1 -mx-1 py-0.5 transition-colors"
    >
      {mark}
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-foreground">{label}</span>
    </button>
  ) : (
    <button type="button" className="cursor-pointer">
      {mark}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-0" align="start">
        <div className="boared-label text-foreground px-3 pt-3 pb-2">Priority</div>
        <div className="flex flex-col">
          {allPriorities.map((p) => (
            <button
              key={p}
              type="button"
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04]",
                p === priority && "bg-foreground text-background hover:bg-foreground"
              )}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <DegreeMark priority={p} className={p === priority ? "text-background" : undefined} />
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em]">{PRIORITY_LABEL[p]}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
