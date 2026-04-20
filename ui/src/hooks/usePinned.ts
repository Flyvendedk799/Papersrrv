/**
 * usePinned — localStorage-backed pin/unpin state for sidebar
 * quick-access of issues / agents / projects.
 *
 * Storage key: `paperclip.pins.<companyId>` → JSON list of
 *   { id, kind, label, href, pinnedAt }
 *
 * Max 12 pins per company. Oldest-pinned evicted when full.
 */

import { useCallback, useEffect, useState } from "react";

export interface Pin {
  id: string;
  kind: "issue" | "agent" | "project" | "plan";
  label: string;
  href: string;
  pinnedAt: number;
}

const MAX_PINS = 12;

function storageKey(companyId: string): string {
  return `paperclip.pins.${companyId}`;
}

function readPins(companyId: string): Pin[] {
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_PINS).filter(
      (p) =>
        p && typeof p.id === "string" && typeof p.href === "string",
    );
  } catch {
    return [];
  }
}

function writePins(companyId: string, pins: Pin[]) {
  try {
    window.localStorage.setItem(storageKey(companyId), JSON.stringify(pins));
  } catch {
    /* storage failures: ignore */
  }
}

/* Broadcast across all hook instances via a simple event so one
 * pin action updates every mounted consumer immediately. */
const CHANGE_EVENT = "paperclip:pins-changed";

export function usePinned(companyId: string | null | undefined) {
  const [pins, setPins] = useState<Pin[]>(() =>
    companyId ? readPins(companyId) : [],
  );

  useEffect(() => {
    if (!companyId) {
      setPins([]);
      return;
    }
    setPins(readPins(companyId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ companyId: string }>).detail;
      if (detail?.companyId === companyId) setPins(readPins(companyId));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [companyId]);

  const pin = useCallback(
    (entry: Omit<Pin, "pinnedAt">) => {
      if (!companyId) return;
      const current = readPins(companyId);
      const filtered = current.filter((p) => p.id !== entry.id);
      const next = [{ ...entry, pinnedAt: Date.now() }, ...filtered].slice(0, MAX_PINS);
      writePins(companyId, next);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { companyId } }));
    },
    [companyId],
  );

  const unpin = useCallback(
    (id: string) => {
      if (!companyId) return;
      const current = readPins(companyId);
      const next = current.filter((p) => p.id !== id);
      writePins(companyId, next);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { companyId } }));
    },
    [companyId],
  );

  const toggle = useCallback(
    (entry: Omit<Pin, "pinnedAt">) => {
      if (!companyId) return;
      const current = readPins(companyId);
      if (current.some((p) => p.id === entry.id)) unpin(entry.id);
      else pin(entry);
    },
    [companyId, pin, unpin],
  );

  const isPinned = useCallback(
    (id: string) => pins.some((p) => p.id === id),
    [pins],
  );

  return { pins, pin, unpin, toggle, isPinned };
}
