/**
 * useGlobalShortcuts — app-wide keyboard shortcuts.
 *
 *   g d  → /dashboard
 *   g i  → /issues
 *   g b  → /backlog
 *   g a  → /agents
 *   g p  → /projects
 *   g f  → /files
 *   c    → open new-issue dialog
 *
 * Suppresses when user is typing in an input. Two-key sequences
 * have a 1-second timeout.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDialog } from "../context/DialogContext";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const pendingRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      pendingRef.current = null;
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Second char of a two-key sequence
      if (pendingRef.current === "g") {
        switch (e.key) {
          case "d":
          case "D":
            e.preventDefault();
            navigate("/dashboard");
            return clearPending();
          case "i":
          case "I":
            e.preventDefault();
            navigate("/issues");
            return clearPending();
          case "b":
          case "B":
            e.preventDefault();
            navigate("/backlog");
            return clearPending();
          case "a":
          case "A":
            e.preventDefault();
            navigate("/agents");
            return clearPending();
          case "p":
          case "P":
            e.preventDefault();
            navigate("/projects");
            return clearPending();
          case "f":
          case "F":
            e.preventDefault();
            navigate("/files");
            return clearPending();
          default:
            return clearPending();
        }
      }

      // First char
      if (e.key === "g" || e.key === "G") {
        pendingRef.current = "g";
        if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = window.setTimeout(clearPending, 1000);
        return;
      }

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (typeof dialog?.openNewIssue === "function") {
          dialog.openNewIssue();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearPending();
    };
  }, [navigate, dialog]);
}
