/**
 * KeyboardHelp — global keyboard shortcut cheat-sheet.
 *
 * Triggered by `?` from anywhere (unless the user is typing in
 * an input). Shows the app-wide shortcuts plus page-specific
 * shortcuts when available. Mounted once in Layout; listens
 * globally for `?`.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

const GLOBAL_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["G", "D"], label: "Go to Dashboard" },
  { keys: ["G", "I"], label: "Go to Issues" },
  { keys: ["G", "B"], label: "Go to Backlog" },
  { keys: ["G", "A"], label: "Go to Agents" },
  { keys: ["C"], label: "New issue" },
  { keys: ["?"], label: "Toggle this cheat-sheet" },
  { keys: ["Esc"], label: "Close overlays" },
];

const ISSUE_PAGE_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["J"], label: "Next chapter" },
  { keys: ["K"], label: "Previous chapter" },
  { keys: ["R"], label: "Reply to the case" },
  { keys: ["G"], label: "Jump to the case graph" },
];

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return true;
  if (t.isContentEditable) return true;
  return false;
}

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="fixed bottom-6 right-6 z-[90] w-[320px] border border-[var(--boared-rule)] bg-[var(--boared-paper)] shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-200"
      ref={panelRef}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-[var(--boared-rule)]">
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Keyboard shortcuts
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="font-mono text-[0.58rem] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
        >
          ✕
        </button>
      </header>
      <div className="max-h-[55vh] overflow-y-auto">
        <Section title="Everywhere" shortcuts={GLOBAL_SHORTCUTS} />
        <Section title="On a case page" shortcuts={ISSUE_PAGE_SHORTCUTS} />
      </div>
      <footer className="px-3 py-2 border-t border-[var(--boared-rule)] font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
        Press ? to toggle
      </footer>
    </div>
  );
}

function Section({
  title,
  shortcuts,
}: {
  title: string;
  shortcuts: Array<{ keys: string[]; label: string }>;
}) {
  return (
    <section className="p-3 space-y-1.5 border-b border-[var(--boared-rule)] last:border-0">
      <h4 className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--boared-acid)] mb-1">
        {title}
      </h4>
      <ul className="space-y-1.5">
        {shortcuts.map((s) => (
          <li
            key={s.keys.join("+") + s.label}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-[0.82rem] text-[var(--boared-ink)]">{s.label}</span>
            <span className="flex items-center gap-0.5 shrink-0">
              {s.keys.map((k, i) => (
                <KBD key={i}>{k}</KBD>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KBD({ children }: { children: React.ReactNode }) {
  return (
    <kbd className={cn(
      "inline-flex items-center justify-center h-5 min-w-[20px] px-1.5",
      "border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]",
      "font-mono text-[0.6rem] text-[var(--boared-ink)] uppercase tracking-[0.08em]",
    )}>
      {children}
    </kbd>
  );
}
