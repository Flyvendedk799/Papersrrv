import { PapeePose, type PapeeAnimState } from "../papee/PapeeSprites";
import type { PapeeMood } from "../../lib/papee-personality";
import { cn } from "../../lib/utils";

/*
 * BOARED PapeeHead — small inline Papee sprite head, intended for editorial
 * "by Papee" attributions across the product. Renders a single PapeePose
 * inside its own <svg> at the requested pixel size.
 *
 * The full Papee character lives in the floating overlay; this is the
 * shrunk-down badge variant that appears next to copy he "wrote".
 *
 * Default state is `idle`. The optional `mood` prop can be used to
 * mood-map a default state without the caller having to know the mapping.
 */

const MOOD_TO_STATE: Record<PapeeMood, PapeeAnimState> = {
  calm: "idle",
  happy: "idle",
  curious: "thinking",
  alert: "head-tilt",
  urgent: "alarmed",
  guarding: "guarding",
  sleepy: "sleepy-nod",
};

interface PapeeHeadProps {
  /** Override the pose explicitly. Wins over `mood`. */
  state?: PapeeAnimState;
  /** Pick the pose by current mood. Falls back to `idle` if neither set. */
  mood?: PapeeMood;
  /** Pixel size of the rendered sprite. Defaults to 36. */
  size?: number;
  /** Optional className for layout positioning. */
  className?: string;
  /** Optional click handler — will route to `/papee` if you want a tappable badge. */
  onClick?: () => void;
}

export function PapeeHead({
  state,
  mood,
  size = 36,
  className,
  onClick,
}: PapeeHeadProps) {
  const finalState: PapeeAnimState = state ?? (mood ? MOOD_TO_STATE[mood] : "idle");
  const height = Math.round(size * (80 / 60));

  const inner = (
    <svg
      viewBox="-6 -8 60 80"
      width={size}
      height={height}
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      <PapeePose state={finalState} />
    </svg>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bg-transparent border-0 p-0 cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        aria-label="Papee"
      >
        {inner}
      </button>
    );
  }
  return inner;
}
