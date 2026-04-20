/**
 * QuickAccessStrip — renders the user's pinned cases + recent
 * visits as a compact vertical list. Drops into the sidebar so
 * the user's most-navigated items are always one click away.
 */

import { Link } from "react-router-dom";
import { Pin, PinOff, Clock } from "lucide-react";
import { useCompany } from "../../context/CompanyContext";
import { usePinned, type Pin as PinEntry } from "../../hooks/usePinned";
import { useRecentlyViewed } from "../../hooks/useRecentlyViewed";
import { cn } from "../../lib/utils";

export function QuickAccessStrip({ className }: { className?: string }) {
  const { selectedCompanyId } = useCompany();
  const { pins, unpin } = usePinned(selectedCompanyId);
  const { entries } = useRecentlyViewed(selectedCompanyId);

  // Show up to 5 recents that aren't already pinned.
  const pinnedIds = new Set(pins.map((p) => p.id));
  const recents = entries.filter((e) => !pinnedIds.has(e.id)).slice(0, 5);

  if (pins.length === 0 && recents.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {pins.length > 0 && (
        <section>
          <header className="flex items-center gap-1.5 px-2 mb-1">
            <Pin className="h-3 w-3 text-[var(--boared-ink-faint)]" aria-hidden="true" />
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
              Pinned
            </span>
          </header>
          <ul className="space-y-px">
            {pins.map((p) => (
              <StripRow key={p.id} entry={p} onUnpin={() => unpin(p.id)} />
            ))}
          </ul>
        </section>
      )}
      {recents.length > 0 && (
        <section>
          <header className="flex items-center gap-1.5 px-2 mb-1">
            <Clock className="h-3 w-3 text-[var(--boared-ink-faint)]" aria-hidden="true" />
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
              Recent
            </span>
          </header>
          <ul className="space-y-px">
            {recents.map((e) => (
              <StripRow key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StripRow({
  entry,
  onUnpin,
}: {
  entry: {
    id: string;
    kind: "issue" | "agent" | "project" | "plan";
    label: string;
    href: string;
  };
  onUnpin?: () => void;
}) {
  const kindColor =
    entry.kind === "issue"
      ? "var(--boared-feature)"
      : entry.kind === "agent"
        ? "var(--boared-review)"
        : entry.kind === "project"
          ? "var(--boared-info)"
          : "var(--boared-success)";
  return (
    <li className="group">
      <Link
        to={entry.href}
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--boared-paper-2)] transition-colors no-underline text-inherit"
      >
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: kindColor }}
        />
        <span className="flex-1 min-w-0 text-[0.78rem] leading-tight text-[var(--boared-ink)] truncate">
          {entry.label}
        </span>
        {onUnpin && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnpin();
            }}
            aria-label="Unpin"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] shrink-0"
          >
            <PinOff className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </Link>
    </li>
  );
}
