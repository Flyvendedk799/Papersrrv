/**
 * useDensity — global compact/comfortable layout preference.
 * Applies a CSS class to the document root so components can
 * respond via `.density-compact &` selectors. Persisted in
 * localStorage.
 */

import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact";
const KEY = "paperclip.density";
const EVENT = "paperclip:density-changed";

function read(): Density {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "compact" || raw === "comfortable") return raw;
  } catch {
    /* ignore */
  }
  return "comfortable";
}

function apply(density: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("density-compact", density === "compact");
  document.documentElement.classList.toggle("density-comfortable", density === "comfortable");
}

export function useDensity() {
  const [density, setDensityState] = useState<Density>(() => read());

  useEffect(() => {
    apply(density);
  }, [density]);

  useEffect(() => {
    const onChange = () => setDensityState(read());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setDensity = useCallback((next: Density) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setDensityState(next);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  const toggle = useCallback(() => {
    setDensity(read() === "compact" ? "comfortable" : "compact");
  }, [setDensity]);

  return { density, setDensity, toggle };
}
