import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * PAPEE_TOOLS_PLAN.md §Z.8 — Streaming dialog bubble.
 *
 * Token-by-token expansion for long Claude responses. Uses its own
 * "long bubble" slot — does not count toward the Z.7 stack limit.
 *
 * Behaviour:
 *   - Pose held externally as `thinking` while streaming.
 *   - Bubble shows a growing underline cursor.
 *   - Click anywhere → calls onInterrupt → caller stops the stream
 *     and plays the `stopping` pose for 400ms.
 *   - Auto-fits to ~28 words. Longer responses are chunked: a
 *     `…more in chat ↓` hint replaces the body and the caller can
 *     escalate to the chat panel.
 */
export interface PapeeStreamingBubbleProps {
  /** Full target text — typed out at `tokensPerSecond` while still streaming. */
  text: string;
  streaming: boolean;
  side: "left" | "right";
  onInterrupt?: () => void;
  tokensPerSecond?: number;
}

const MAX_INLINE_WORDS = 28;

export function PapeeStreamingBubble({
  text,
  streaming,
  side,
  onInterrupt,
  tokensPerSecond = 40,
}: PapeeStreamingBubbleProps) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!streaming) {
      setShown(text);
      return;
    }
    let cancelled = false;
    const intervalMs = 1000 / tokensPerSecond;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i = Math.min(text.length, i + 2);
      setShown(text.slice(0, i));
      if (i < text.length) setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [text, streaming, tokensPerSecond]);

  const words = shown.trim().split(/\s+/);
  const tooLong = words.length > MAX_INLINE_WORDS;
  const body = tooLong ? "…more in chat ↓" : shown;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onInterrupt}
      className={cn(
        "pointer-events-auto cursor-pointer max-w-[280px] rounded-xl border border-border",
        "bg-card/95 backdrop-blur-sm px-3.5 py-2.5 text-xs text-foreground shadow-lg",
        "papee-speech-bubble",
      )}
      style={{
        position: "absolute",
        bottom: 80,
        [side === "right" ? "right" : "left"]: 8,
      }}
    >
      <p className="leading-relaxed whitespace-pre-wrap">
        {body}
        {streaming && !tooLong && (
          <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-foreground/60 animate-pulse" />
        )}
      </p>
    </div>
  );
}
