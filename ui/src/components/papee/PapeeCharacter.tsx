import { useEffect, useRef, useState } from "react";
import { PapeePose, type PapeeAnimState } from "./PapeeSprites";
import { cn } from "../../lib/utils";
import "./papee-animations.css";

interface PapeeCharacterProps {
  state: PapeeAnimState;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  chatOpen?: boolean;
  /**
   * Boared-rebrand prop. Accepted for forward compatibility with the
   * mobile companion surfaces; currently unused by the base sprite
   * renderer (mood is rendered via overlay/effects elsewhere).
   */
  mood?: string;
}

const SIZE_MAP = {
  sm: { width: 40, height: 52 },
  md: { width: 56, height: 72 },
  lg: { width: 72, height: 92 },
};

/** Animation class for the outermost wrapper per-state */
function stateAnimClass(state: PapeeAnimState): string {
  switch (state) {
    case "idle":
    case "idle-blink":
    case "idle-look-around":
    case "sleeping":
      return "papee-idle";
    case "jumping":
      return "papee-jump";
    case "celebrating":
      return "papee-celebrate";
    case "thinking":
      return "papee-think";
    case "waving":
      return "papee-idle"; // gentle float while waving
    default:
      return "";
  }
}

/** Glow animation class per-state */
function glowClass(state: PapeeAnimState): string {
  switch (state) {
    case "celebrating": return "papee-glow-celebrate";
    case "alarmed": return "papee-glow-alarm";
    case "thinking": return "papee-glow-think";
    default: return "";
  }
}

/** Glow color per-state */
function glowColor(state: PapeeAnimState): string {
  switch (state) {
    case "celebrating": return "bg-amber-400/25 dark:bg-amber-400/15";
    case "alarmed": return "bg-red-400/25 dark:bg-red-400/15";
    case "thinking": return "bg-blue-400/20 dark:bg-blue-400/10";
    case "waving": return "bg-emerald-400/15 dark:bg-emerald-400/10";
    case "thumbs-up": return "bg-emerald-400/15 dark:bg-emerald-400/10";
    default: return "";
  }
}

export function PapeeCharacter({ state, size = "md", className, onClick, chatOpen }: PapeeCharacterProps) {
  const { width, height } = SIZE_MAP[size];
  const [walkFrame, setWalkFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  // Walk frame cycling
  useEffect(() => {
    if (state !== "walking") { setWalkFrame(0); return; }
    const WALK_FRAME_MS = 250;
    function step(ts: number) {
      if (ts - lastFrameRef.current >= WALK_FRAME_MS) {
        lastFrameRef.current = ts;
        setWalkFrame((f) => f + 1);
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state]);

  const hasGlow = !!glowColor(state);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative cursor-pointer group",
        "transition-transform duration-200 ease-out",
        "hover:scale-[1.12] active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg",
        stateAnimClass(state),
        className,
      )}
      style={{ width, height }}
      aria-label={chatOpen ? "Close chat with Papee" : "Chat with Papee"}
      aria-expanded={chatOpen}
    >
      {/* Ambient glow — color-coded per state with pulse animation */}
      <div
        className={cn(
          "absolute -inset-2 rounded-full blur-xl transition-all duration-700",
          hasGlow ? [glowColor(state), glowClass(state), "opacity-100"] : "opacity-0",
        )}
      />

      {/* Hover ring */}
      <div className={cn(
        "absolute -inset-1 rounded-full transition-all duration-300",
        "opacity-0 group-hover:opacity-100",
        "border-2 border-primary/20",
        chatOpen && "opacity-100 border-primary/30",
      )} />

      {/* The SVG character */}
      <svg
        viewBox="-6 -8 60 80"
        width={width}
        height={height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={cn(
          "relative",
          "drop-shadow-[0_2px_6px_oklch(0_0_0/0.2)] dark:drop-shadow-[0_2px_8px_oklch(0_0_0/0.5)]",
          // State-specific SVG filter effects
          state === "sleeping" && "opacity-80 saturate-[0.7]",
        )}
      >
        <PapeePose state={state} walkFrame={walkFrame} />
      </svg>
    </button>
  );
}
