/**
 * EmptyState — standardised "nothing here yet" surface.
 *
 * Used across pages where a list is empty. Always offers the
 * reader something: a serif italic prose line explaining the
 * state, optional helper bullets previewing what will appear,
 * and an optional primary CTA.
 *
 * Keeps the Boared voice consistent: paper background, dashed
 * border, serif italic body, mono kicker.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface Props {
  title: string;
  description?: string;
  kicker?: string;
  icon?: LucideIcon;
  hints?: Array<{ icon: string; label: string }>;
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  kicker,
  icon: Icon,
  hints,
  primaryAction,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "border border-dashed border-[var(--boared-rule)] bg-[var(--boared-paper-2)]/40 p-6 text-center space-y-3",
        className,
      )}
    >
      {Icon && (
        <div className="flex justify-center">
          <span className="inline-flex items-center justify-center h-10 w-10 border border-[var(--boared-rule)] text-[var(--boared-ink-faint)]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      )}
      {kicker && (
        <div className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          {kicker}
        </div>
      )}
      <p className="font-serif italic text-[1.05rem] leading-snug text-[var(--boared-ink)] max-w-[44ch] mx-auto">
        {title}
      </p>
      {description && (
        <p className="text-[0.86rem] leading-snug text-[var(--boared-ink-soft)] max-w-[52ch] mx-auto">
          {description}
        </p>
      )}
      {hints && hints.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 max-w-[48ch] mx-auto pt-1">
          {hints.map((h) => (
            <li
              key={h.label}
              className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]"
            >
              <span aria-hidden="true" className="text-[0.9rem]">
                {h.icon}
              </span>
              {h.label}
            </li>
          ))}
        </ul>
      )}
      {primaryAction && (
        <div className="pt-2">
          {primaryAction.href ? (
            <a
              href={primaryAction.href}
              className="inline-flex items-center justify-center h-8 px-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-acid)]/70 text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/[0.08] transition-colors no-underline"
            >
              {primaryAction.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex items-center justify-center h-8 px-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-acid)]/70 text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/[0.08] transition-colors"
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
