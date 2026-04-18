import { cn } from "../../lib/utils";

interface PapeeMiniIndicatorProps {
  onClick: () => void;
  hasActivity?: boolean;
  className?: string;
}

/**
 * Minimized Papee — just a small paperclip icon with an optional activity badge.
 * Shown when the user has minimized Papee but not hidden it entirely.
 */
export function PapeeMiniIndicator({ onClick, hasActivity, className }: PapeeMiniIndicatorProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center w-10 h-10 rounded-full",
        "bg-card border border-border shadow-sm",
        "hover:bg-accent/50 hover:scale-110 active:scale-95",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="Expand Papee"
    >
      {/* Mini paperclip SVG */}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 3.5C11 3.5 9 5.5 9 8v8c0 1.7 1.3 3 3 3s3-1.3 3-3V7c0-1.1-.9-2-2-2s-2 .9-2 2v8" />
      </svg>

      {/* Activity badge */}
      {hasActivity && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_0_2px_hsl(var(--background))]">
          <span className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75 motion-reduce:animate-none" />
        </span>
      )}
    </button>
  );
}
