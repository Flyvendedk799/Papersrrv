/**
 * useCaseKeyboardNav — global keyboard shortcuts for the CasePage.
 *
 *   j / ArrowDown  → next chapter
 *   k / ArrowUp    → previous chapter
 *   r              → focus the reply composer
 *   g              → jump to the graph
 *   .              → jump to artifacts
 *   /              → focus thread search (if present; else scroll to thread)
 *   Esc            → clear focus / collapse detail panels
 *   ?              → toggle the cheat-sheet popover
 *
 * Suppressed when the user is typing in an input/textarea/contentEditable.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface CaseKbChapter {
  id: string;
  label: string;
}

interface Options {
  chapters: CaseKbChapter[];
  onFocusComposer?: () => void;
}

const TYPING_ELEMENTS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TYPING_ELEMENTS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useCaseKeyboardNav({ chapters, onFocusComposer }: Options) {
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const currentIndexRef = useRef(0);

  const jumpToIndex = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(chapters.length - 1, idx));
      const target = chapters[clamped];
      if (!target) return;
      const el = document.getElementById(target.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      currentIndexRef.current = clamped;
    },
    [chapters],
  );

  const jumpToId = useCallback(
    (id: string) => {
      const idx = chapters.findIndex((c) => c.id === id);
      if (idx >= 0) jumpToIndex(idx);
      else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [chapters, jumpToIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Allow Esc to work even when typing is in progress (handled
      // elsewhere for unfocus).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          if (e.key === "ArrowDown" && e.shiftKey) return;
          e.preventDefault();
          jumpToIndex(currentIndexRef.current + 1);
          return;
        }
        case "k":
        case "ArrowUp": {
          if (e.key === "ArrowUp" && e.shiftKey) return;
          e.preventDefault();
          jumpToIndex(currentIndexRef.current - 1);
          return;
        }
        case "r": {
          if (!onFocusComposer) return;
          e.preventDefault();
          jumpToId("chapter-correspondence");
          // Delay the focus so the scroll has a chance to start.
          window.setTimeout(onFocusComposer, 180);
          return;
        }
        case "g": {
          e.preventDefault();
          jumpToId("chapter-graph");
          return;
        }
        case ".": {
          e.preventDefault();
          jumpToId("chapter-artifacts");
          return;
        }
        case "/": {
          e.preventDefault();
          jumpToId("chapter-correspondence");
          return;
        }
        case "?": {
          e.preventDefault();
          setCheatSheetOpen((v) => !v);
          return;
        }
        case "Escape": {
          setCheatSheetOpen(false);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpToIndex, jumpToId, onFocusComposer]);

  // Track current chapter via scroll — so j/k always starts from
  // where the user is looking, not from the last pressed key.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = chapters
      .map((c) => ({ id: c.id, el: document.getElementById(c.id) }))
      .filter((x): x is { id: string; el: HTMLElement } => !!x.el);
    if (els.length === 0) return;
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(e.target.id, e.intersectionRatio);
        let bestIdx = currentIndexRef.current;
        let bestRatio = 0;
        chapters.forEach((c, i) => {
          const r = ratios.get(c.id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestIdx = i;
          }
        });
        currentIndexRef.current = bestIdx;
      },
      {
        rootMargin: "-20% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const { el } of els) observer.observe(el);
    return () => observer.disconnect();
  }, [chapters]);

  return { cheatSheetOpen, setCheatSheetOpen };
}
