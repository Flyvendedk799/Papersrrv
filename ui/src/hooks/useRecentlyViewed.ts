/**
 * useRecentlyViewed — LRU list of the last N entities a user
 * visited in a given company. Used by the sidebar / command
 * palette to surface "recent" jumps.
 */

import { useCallback, useEffect, useState } from "react";

export interface RecentEntry {
  id: string;
  kind: "issue" | "agent" | "project" | "plan";
  label: string;
  href: string;
  viewedAt: number;
}

const MAX = 15;
const CHANGE_EVENT = "paperclip:recent-changed";

function key(companyId: string) {
  return `paperclip.recent.${companyId}`;
}

function read(companyId: string): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(key(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.id === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function write(companyId: string, entries: RecentEntry[]) {
  try {
    window.localStorage.setItem(key(companyId), JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function useRecentlyViewed(companyId: string | null | undefined) {
  const [entries, setEntries] = useState<RecentEntry[]>(() =>
    companyId ? read(companyId) : [],
  );

  useEffect(() => {
    if (!companyId) {
      setEntries([]);
      return;
    }
    setEntries(read(companyId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ companyId: string }>).detail;
      if (detail?.companyId === companyId) setEntries(read(companyId));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [companyId]);

  const record = useCallback(
    (entry: Omit<RecentEntry, "viewedAt">) => {
      if (!companyId) return;
      const current = read(companyId);
      const filtered = current.filter((e) => e.id !== entry.id);
      const next = [{ ...entry, viewedAt: Date.now() }, ...filtered].slice(0, MAX);
      write(companyId, next);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { companyId } }));
    },
    [companyId],
  );

  return { entries, record };
}
