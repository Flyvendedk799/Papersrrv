import type { QueuedBubble } from "@/lib/papee-bubbles";
import { cn } from "@/lib/utils";

/**
 * PAPEE_TOOLS_PLAN.md §Z.7 — visual rendering of the bubble stack.
 *
 * Renders up to 2 bubbles with depth-cue stacking: the older bubble is
 * pushed up 28px and scaled to 90%. Critical bubbles get an alert
 * outline.
 */
export interface PapeeBubbleStackProps {
  bubbles: QueuedBubble[];
  side: "left" | "right";
}

export function PapeeBubbleStack({ bubbles, side }: PapeeBubbleStackProps) {
  if (bubbles.length === 0) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute -top-2 flex flex-col-reverse gap-1",
        side === "right" ? "right-0 items-end" : "left-0 items-start",
      )}
    >
      {bubbles.map((b, i) => {
        const fromBottom = bubbles.length - 1 - i;
        const offsetY = fromBottom * 28;
        const scale = 1 - fromBottom * 0.1;
        const isCritical = b.severity === "critical";
        return (
          <div
            key={b.id}
            className={cn(
              "max-w-[260px] rounded-xl border bg-card/95 backdrop-blur-sm px-3.5 py-2 text-xs shadow-lg",
              "papee-speech-bubble",
              isCritical
                ? "border-red-500/70 text-red-600 dark:text-red-300"
                : "border-border text-foreground",
            )}
            style={{
              transform: `translateY(-${offsetY}px) scale(${scale})`,
              transformOrigin: side === "right" ? "bottom right" : "bottom left",
              opacity: 1 - fromBottom * 0.15,
            }}
          >
            {b.text}
          </div>
        );
      })}
    </div>
  );
}
