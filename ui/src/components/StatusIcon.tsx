import { useState } from "react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

/*
 * BOARED status code — typographic register marker.
 *
 * Replaces the universal SaaS pattern of colored circle/checkmark glyphs
 * with a hairline-bordered 2-character mono code, the way a stockmarket
 * ticker reports a state. Looks like nothing else in the category.
 *
 * Codes:
 *   BL  backlog
 *   TD  todo / unstarted
 *   IP  in progress
 *   IR  in review
 *   DN  done
 *   CN  cancelled
 *   BK  blocked
 */

const STATUS_CODE: Record<string, string> = {
  backlog: "BL",
  todo: "TD",
  in_progress: "IP",
  in_review: "IR",
  done: "DN",
  cancelled: "CN",
  blocked: "BK",
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

interface StatusIconProps {
  status: string;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

function StatusBox({ status, className }: { status: string; className?: string }) {
  const code = STATUS_CODE[status] ?? "··";
  // Tonal variation by state — done is muted, in-progress is foreground,
  // blocked is the only acid-tinted state. Cancelled is struck through.
  const isDone = status === "done";
  const isCancelled = status === "cancelled";
  const isBlocked = status === "blocked";
  const isInProgress = status === "in_progress";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none",
        "h-[18px] min-w-[24px] px-1 border",
        "font-mono text-[0.58rem] uppercase tracking-[0.06em] tabular-nums leading-none",
        // Default = hairline border, foreground text
        "border-[var(--boared-rule)] text-foreground",
        // In-progress = solid foreground fill
        isInProgress && "bg-foreground text-background border-foreground",
        // Blocked = acid border + acid text
        isBlocked && "border-[var(--boared-acid)] text-[var(--boared-acid)]",
        // Done = muted ink, no fill
        isDone && "border-[var(--boared-rule)] text-muted-foreground",
        // Cancelled = strikethrough
        isCancelled && "text-muted-foreground line-through",
        className,
      )}
      aria-label={STATUS_LABEL[status] ?? status}
    >
      {code}
    </span>
  );
}

export function StatusIcon({ status, onChange, className, showLabel }: StatusIconProps) {
  const [open, setOpen] = useState(false);
  const label = STATUS_LABEL[status] ?? status;

  const box = <StatusBox status={status} className={className} />;

  if (!onChange) {
    return showLabel ? (
      <span className="inline-flex items-center gap-2">
        {box}
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-foreground">{label}</span>
      </span>
    ) : (
      box
    );
  }

  const trigger = showLabel ? (
    <button
      type="button"
      className="inline-flex items-center gap-2 cursor-pointer hover:bg-foreground/[0.04] px-1 -mx-1 py-0.5 transition-colors"
    >
      {box}
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-foreground">{label}</span>
    </button>
  ) : (
    <button type="button" className="cursor-pointer">
      {box}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-44 p-0" align="start">
        <div className="boared-label text-foreground px-3 pt-3 pb-2">Status</div>
        <div className="flex flex-col">
          {allStatuses.map((s) => (
            <button
              key={s}
              type="button"
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04]",
                s === status && "bg-foreground text-background hover:bg-foreground"
              )}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              <StatusBox status={s} className={s === status ? "border-background" : undefined} />
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em]">{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
