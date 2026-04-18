import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { PapeeHead } from "./PapeeHead";
import type { PapeeMood } from "../../lib/papee-personality";

/*
 * BOARED PapeeMemo — a typewritten memo block. Used on the Dashboard as
 * Papee's daily briefing to the operator. Frames `lines` (one or more
 * sentences) as the memo body, with TO/FROM/RE/DATED metadata rows on the
 * left and a Papee sprite signature in the bottom-right.
 *
 * Layout (mono throughout):
 *
 *   ┌─ MEMO ─────────────────────────────────────────────┐
 *   │  TO    {to}                                        │
 *   │  FROM  Papee                                       │
 *   │  RE    {re}                                        │
 *   │  DATED {dated}                                     │
 *   ├────────────────────────────────────────────────────┤
 *   │  {lines}                                           │
 *   ├────────────────────────────────────────────────────┤
 *   │                                       — Papee  🐷  │
 *   └────────────────────────────────────────────────────┘
 *
 * The component is structural only — it doesn't compose copy. The caller
 * passes `lines` already in Papee's voice.
 */
interface PapeeMemoProps {
  to?: string;
  re: string;
  dated: string;
  lines: ReactNode[];
  /** Mood drives the small Papee sprite's pose in the signature. */
  mood?: PapeeMood;
  className?: string;
}

const MetaRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-[5rem_1fr] gap-3 py-1 items-baseline">
    <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </span>
    <span className="font-mono text-[0.74rem] text-foreground truncate">{value}</span>
  </div>
);

export function PapeeMemo({
  to = "You",
  re,
  dated,
  lines,
  mood,
  className,
}: PapeeMemoProps) {
  return (
    <article
      className={cn(
        "relative border border-foreground bg-[var(--boared-paper)]",
        "max-w-[680px]",
        className
      )}
      aria-label="Memo from Papee"
    >
      {/* Top stamp — "MEMO" header tab on the upper-left edge */}
      <div className="absolute -top-[10px] left-4 px-2 bg-[var(--boared-paper)]">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-foreground">
          Memo
        </span>
      </div>

      {/* Metadata block */}
      <header className="px-5 pt-5 pb-3 border-b border-[var(--boared-rule)]">
        <MetaRow label="To" value={to} />
        <MetaRow label="From" value="Papee" />
        <MetaRow label="Re" value={re} />
        <MetaRow label="Dated" value={dated} />
      </header>

      {/* Body — Papee's voice */}
      <div className="px-5 py-5 border-b border-[var(--boared-rule)] space-y-2">
        {lines.map((line, i) => (
          <p
            key={i}
            className="font-mono text-[0.82rem] leading-relaxed text-foreground"
          >
            {line}
          </p>
        ))}
      </div>

      {/* Signature */}
      <footer className="px-5 py-3 flex items-end justify-end gap-3">
        <span className="font-mono text-[0.7rem] text-muted-foreground italic">
          — Papee
        </span>
        <PapeeHead mood={mood} size={28} className="-mb-1" />
      </footer>
    </article>
  );
}
