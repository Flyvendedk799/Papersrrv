/**
 * CaseBanner — promoted "this case is waiting on you" line above
 * the artifacts section.
 *
 * Appears when an approval is pending, the case is blocked, or
 * when the next-action synthesis suggests a specific thing to do.
 * Acid-red border + serif italic body so it reads like a margin
 * note on the case file, not a toast.
 */

import { cn } from "../../../lib/utils";

interface Props {
  tone?: "alert" | "warn" | "info";
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const TONE: Record<
  NonNullable<Props["tone"]>,
  { border: string; text: string; bg: string }
> = {
  alert: {
    border: "border-[var(--boared-acid)]/70",
    text: "text-[var(--boared-acid)]",
    bg: "bg-[var(--boared-acid)]/[0.04]",
  },
  warn: {
    border: "border-[var(--boared-warn)]/60",
    text: "text-[var(--boared-warn)]",
    bg: "bg-[var(--boared-warn)]/[0.04]",
  },
  info: {
    border: "border-[var(--boared-info)]/60",
    text: "text-[var(--boared-info)]",
    bg: "bg-[var(--boared-info)]/[0.04]",
  },
};

export function CaseBanner({
  tone = "alert",
  icon,
  title,
  detail,
  action,
  className,
}: Props) {
  const t = TONE[tone];
  return (
    <aside
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-l-2",
        t.border,
        t.bg,
        className,
      )}
      role="status"
    >
      {icon && (
        <span aria-hidden="true" className={cn("mt-0.5 shrink-0", t.text)}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className={cn("font-mono text-[0.58rem] uppercase tracking-[0.16em]", t.text)}>
          {title}
        </div>
        {detail && (
          <p className="mt-1 font-serif italic text-[0.9rem] leading-snug text-[var(--boared-ink)]">
            {detail}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "inline-flex items-center h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border transition-colors focus-visible:outline-none focus-visible:ring-2",
            t.border,
            t.text,
            "hover:bg-[var(--boared-paper-2)]",
          )}
        >
          {action.label}
        </button>
      )}
    </aside>
  );
}
