/**
 * CaseStamp — the rotated rubber-stamp mark that calls out a case's
 * dominant state: DONE, BLOCKED, LIVE, OPEN. Reads as a mark a clerk
 * would ink onto the case file's cover.
 *
 * Visually: thick double-border box, uppercase serif with letter-
 * spacing, slight rotation, low opacity so it feels imprinted
 * rather than applied.
 */

import { cn } from "../../../lib/utils";
import type { IssueStatus } from "@paperclipai/shared";

interface Props {
  status: IssueStatus | string;
  liveNow?: boolean;
  className?: string;
}

const STAMP: Record<string, { label: string; tone: "ink" | "acid" | "mute" }> = {
  done: { label: "Resolved", tone: "ink" },
  cancelled: { label: "Cancelled", tone: "mute" },
  blocked: { label: "Blocked", tone: "acid" },
  in_review: { label: "In review", tone: "ink" },
  in_progress: { label: "In flight", tone: "ink" },
  todo: { label: "Open", tone: "ink" },
  backlog: { label: "Backlog", tone: "mute" },
};

const TONE: Record<"ink" | "acid" | "mute", { border: string; text: string }> = {
  ink: {
    border: "border-[var(--boared-ink)]",
    text: "text-[var(--boared-ink)]",
  },
  acid: {
    border: "border-[var(--boared-acid)]",
    text: "text-[var(--boared-acid)]",
  },
  mute: {
    border: "border-[var(--boared-ink-faint)]",
    text: "text-[var(--boared-ink-faint)]",
  },
};

export function CaseStamp({ status, liveNow, className }: Props) {
  const entry = STAMP[status] ?? STAMP.todo;
  const tone = liveNow ? "acid" : entry.tone;
  const t = TONE[tone];
  const label = liveNow ? "Live" : entry.label;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center select-none pointer-events-none",
        "rotate-[-6deg] origin-center",
        "border-[3px] double-border px-4 py-1.5",
        "font-serif italic uppercase tracking-[0.18em]",
        "text-[1.15rem] leading-none",
        "opacity-75",
        t.border,
        t.text,
        className,
      )}
      style={{
        borderStyle: "double",
        boxShadow: "inset 0 0 0 1px currentColor",
      }}
    >
      {label}
    </div>
  );
}
