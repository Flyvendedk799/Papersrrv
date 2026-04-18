/**
 * Recently viewed files — in-session shortcut cache (backlog 2.0 D4).
 *
 * Keeps a small LRU of file paths that the user has opened in any
 * surface, so we can render a "recently viewed" strip in Files and a
 * quick-jump list in the markdown reader. Per-file scroll position
 * is also persisted here so reopening a doc returns the user to
 * where they left off.
 *
 * Storage: sessionStorage to avoid polluting localStorage across
 * tabs. Silent-fail on quota / unavailable storage.
 */

export interface RecentFileEntry {
  filePath: string;
  contentHash?: string | null;
  lastViewedAt: number;
  /** Opaque scroll offset for the reader/modal. */
  scrollTop?: number;
}

const KEY = "paperclip.recentFiles.v1";
const MAX = 10;

function readAll(): RecentFileEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.filePath === "string");
  } catch { return []; }
}

function writeAll(entries: RecentFileEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch { /* quota / unavailable: ignore */ }
}

export function recordRecentFile(filePath: string, contentHash?: string | null): void {
  const list = readAll().filter((e) => e.filePath !== filePath);
  list.unshift({ filePath, contentHash: contentHash ?? null, lastViewedAt: Date.now() });
  writeAll(list);
}

export function getRecentFiles(): RecentFileEntry[] { return readAll(); }

export function saveScrollPosition(filePath: string, scrollTop: number): void {
  const list = readAll();
  const idx = list.findIndex((e) => e.filePath === filePath);
  if (idx === -1) return;
  list[idx] = { ...list[idx], scrollTop };
  writeAll(list);
}

export function getScrollPosition(filePath: string): number | undefined {
  return readAll().find((e) => e.filePath === filePath)?.scrollTop;
}
