import { useEffect, useState } from "react";

/**
 * Papee tier-1 undo toast (PAPEE_TOOLS_PLAN.md §1 — "2s undo toast").
 *
 * Shown by papee.enact() after every successful tier-1 mutation.
 * Auto-dismisses after `durationMs`. Click → invokes `onUndo`.
 *
 * Stays out of the global toast stack so it doesn't fight with the
 * shadcn Toaster — Papee owns the bottom-right corner just above his
 * sprite.
 */
export interface PapeeUndoToastProps {
  message: string;
  durationMs: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export function PapeeUndoToast({ message, durationMs, onUndo, onDismiss }: PapeeUndoToastProps) {
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setProgress(1 - t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else onDismiss();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, onDismiss]);

  return (
    <div
      className="papee-undo-toast"
      role="status"
      style={{
        position: "fixed",
        bottom: 96,
        right: 24,
        zIndex: 60,
        minWidth: 240,
        background: "var(--card)",
        color: "var(--card-foreground)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          fontSize: 12,
          fontWeight: 600,
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "4px 10px",
          cursor: "pointer",
        }}
      >
        Undo
      </button>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 2,
          width: `${progress * 100}%`,
          background: "var(--primary, #6366f1)",
          borderRadius: "0 0 10px 10px",
          transition: "width 80ms linear",
        }}
      />
    </div>
  );
}
