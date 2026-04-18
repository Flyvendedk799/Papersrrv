/**
 * Global keyboard shortcuts for the Files tab.
 *
 *   Cmd/Ctrl+P   → toggle quick-open
 *   Cmd/Ctrl+1   → Overview mode
 *   Cmd/Ctrl+2   → Reader mode
 *   O            → toggle Inspector
 *   T            → toggle Left Rail
 *   [ / ]        → previous/next version (reader only)
 *   J / K        → navigate focused list (handled by parent via `onNav`)
 *   G H          → go to Overview (two-key sequence like Linear)
 *
 * The hook intentionally does NOT handle Enter — Enter-to-open is
 * owned by whatever list currently has focus so screenreaders hear
 * the right action. The hook bails out when focus is inside a text
 * input or contenteditable so typing in search doesn't eat shortcuts.
 */

import { useEffect, useRef } from "react";

export interface FilesKeyboardHandlers {
  onQuickOpen: () => void;
  onMode?: (mode: "overview" | "reader") => void;
  onToggleInspector?: () => void;
  onToggleLeftRail?: () => void;
  onOlderVersion?: () => void;
  onNewerVersion?: () => void;
  onNavList?: (dir: 1 | -1) => void;
  onGoOverview?: () => void;
  /** Return true to prevent the hook from handling; useful when a modal is open. */
  isBlocked?: () => boolean;
}

function inFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useFilesKeyboard(handlers: FilesKeyboardHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let awaitingG = false;
    let awaitingGTimer: number | null = null;

    function clearG() {
      awaitingG = false;
      if (awaitingGTimer) {
        window.clearTimeout(awaitingGTimer);
        awaitingGTimer = null;
      }
    }

    function onKey(e: KeyboardEvent) {
      const h = handlersRef.current;
      if (h.isBlocked?.()) return;
      const cmd = e.metaKey || e.ctrlKey;

      if (cmd && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        h.onQuickOpen();
        return;
      }
      if (cmd && e.key === "1") {
        e.preventDefault();
        h.onMode?.("overview");
        return;
      }
      if (cmd && e.key === "2") {
        e.preventDefault();
        h.onMode?.("reader");
        return;
      }

      if (inFormControl(e.target) || e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === "[") {
        e.preventDefault();
        h.onOlderVersion?.();
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        h.onNewerVersion?.();
        return;
      }
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        h.onToggleInspector?.();
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        h.onToggleLeftRail?.();
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        h.onNavList?.(1);
        return;
      }
      if (e.key === "k") {
        e.preventDefault();
        h.onNavList?.(-1);
        return;
      }

      if (awaitingG) {
        if (e.key === "h" || e.key === "H") {
          e.preventDefault();
          clearG();
          h.onGoOverview?.();
          return;
        }
        clearG();
      }

      if (e.key === "g" || e.key === "G") {
        awaitingG = true;
        awaitingGTimer = window.setTimeout(clearG, 800);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, []);
}
