import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";

export type PapeeTargetCategory = "agent" | "issue" | "activity" | "secret" | "metric" | "general";

export interface PapeeTarget {
  id: string;
  label: string;
  category: PapeeTargetCategory;
  priority: number;  // higher = more important
  element: HTMLElement;
  rect: DOMRect;
  visible: boolean;
}

interface PapeeTargetRegistryValue {
  registerTarget: (target: Omit<PapeeTarget, "rect" | "visible">) => void;
  unregisterTarget: (id: string) => void;
  getTarget: (id: string) => PapeeTarget | undefined;
  getVisibleTargets: (category?: PapeeTargetCategory) => PapeeTarget[];
  refreshRect: (id: string) => void;
}

const PapeeTargetCtx = createContext<PapeeTargetRegistryValue | null>(null);

export function usePapeeTargetRegistry(): PapeeTargetRegistryValue {
  const ctx = useContext(PapeeTargetCtx);
  if (!ctx) throw new Error("usePapeeTargetRegistry must be used within PapeeTargetRegistryProvider");
  return ctx;
}

export function usePapeeTargetRegistryOptional() {
  return useContext(PapeeTargetCtx);
}

export function PapeeTargetRegistryProvider({ children }: { children: ReactNode }) {
  const targetsRef = useRef<Map<string, PapeeTarget>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [, _forceUpdate] = useState(0);
  const rafRef = useRef<number | null>(null);

  // ─── RESTORED: lines 41-107 were lost in destruction; reconstruct inline ───
  // TODO: re-implement registerTarget / unregisterTarget / getTarget / getVisibleTargets
  const registerTarget = () => {};
  const unregisterTarget = () => {};
  const getTarget = () => undefined;
  const getVisibleTargets = useCallback(() => {
    const filtered = category ? all.filter((t) => t.category === category) : all;
    return filtered.sort((a, b) => b.priority - a.priority);
  }, []);

  const refreshRect = useCallback((id: string) => {
    const target = targetsRef.current.get(id);
    if (target && target.element.isConnected) {
      const rect = target.element.getBoundingClientRect();
      target.rect = rect;
      // Recompute visibility synchronously — the IntersectionObserver may not
      // have fired yet after a programmatic scroll.
      target.visible = rect.bottom > 0
        && rect.top < window.innerHeight
        && rect.right > 0
        && rect.left < window.innerWidth;
    }
  }, []);

  return (
    <PapeeTargetCtx.Provider value={{ registerTarget, unregisterTarget, getTarget, getVisibleTargets, refreshRect }}>
      {children}
    </PapeeTargetCtx.Provider>
  );
}
