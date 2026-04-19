/**
 * CaseKeyboardCheatSheet — the popover that appears when the user
 * presses `?`. Lists the page's keyboard shortcuts with kbd-style
 * keycaps. Closes on Esc or click-outside.
 */

import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  className?: string;
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["j"], label: "Next chapter" },
  { keys: ["k"], label: "Previous chapter" },
  { keys: ["r"], label: "Reply to the case" },
  { keys: ["g"], label: "Jump to the case graph" },
  { keys: ["."], label: "Jump to artifacts" },
  { keys: ["/"], label: "Jump to the thread" },
  { keys: ["Esc"], label: "Clear focus" },
  { keys: ["?"], label: "Toggle this cheat-sheet" },
];

export function CaseKeyboardCheatSheet({ open, onClose, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[280px] border border-[var(--boared-rule)] bg-[var(--boared-paper)] shadow-lg",
        "animate-[cg-slide-in_180ms_cubic-bezier(0.22,0.61,0.36,1)_backwards]",
        className,
      )}
      ref={ref}
    >
      <style>{`
        @keyframes cg-slide-in {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <header className="flex items-center justify-between px-3 py-2 border-b border-[var(--boared-rule)]">
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Keyboard
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
        >
          ✕
        </button>
      </header>
      <ul className="p-3 space-y-1.5">
        {SHORTCUTS.map((s) => (
          <li
            key={s.keys.join("+")}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-[0.82rem] text-[var(--boared-ink)]">
              {s.label}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] font-mono text-[0.6rem] text-[var(--boared-ink)] uppercase tracking-[0.08em]"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <footer className="px-3 py-2 border-t border-[var(--boared-rule)] font-mono text-[0.5rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
        Press ? to toggle
      </footer>
    </div>
  );
}
