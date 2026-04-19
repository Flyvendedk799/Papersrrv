/**
 * OrnamentalRule — a section divider with character. Two thin
 * parallel rules with a small centre ornament, echoing old
 * letterpress chapter breaks. Used above major case-file
 * sections to give the page typographic rhythm.
 */

import { cn } from "../../../lib/utils";

interface Props {
  ornament?: string;
  tone?: "ink" | "mute" | "acid";
  className?: string;
}

const TONE: Record<"ink" | "mute" | "acid", string> = {
  ink: "text-[var(--boared-ink)] bg-[var(--boared-ink)]/50",
  mute: "text-[var(--boared-ink-faint)] bg-[var(--boared-rule)]",
  acid: "text-[var(--boared-acid)] bg-[var(--boared-acid)]/40",
};

export function OrnamentalRule({
  ornament = "§",
  tone = "mute",
  className,
}: Props) {
  const [text, bg] = TONE[tone].split(" ");
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center gap-3 select-none", className)}
    >
      <span className={cn("flex-1 h-px", bg)} />
      <span
        className={cn("font-serif italic text-[0.9rem] leading-none", text)}
      >
        {ornament}
      </span>
      <span className={cn("flex-1 h-px", bg)} />
    </div>
  );
}
