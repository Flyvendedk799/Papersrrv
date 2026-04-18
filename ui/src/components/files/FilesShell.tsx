/**
 * FilesShell — three-zone layout (LeftRail | Center | Inspector) with
 * a slim mode tab strip at the top and a status bar at the bottom.
 *
 * Owns the cross-zone state: current mode, selected file, open tabs,
 * inspector visibility, left rail visibility, quick-open visibility.
 * The containing page is a thin router that parses/serialises URL
 * state and hands it to this shell.
 *
 * The shell is what the design guide calls a "3-zone layout": left
 * rail for nav, center for the primary work, right inspector for
 * metadata — and the columns are `w-*` fixed widths so content flows
 * cleanly at every break.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, FileText, Search, PanelRight, PanelLeft, CheckCircle2, AlertCircle, Radio } from "lucide-react";
import type { FileScope } from "@paperclipai/shared";
import { filesApi } from "@/api/files";
import { queryKeys } from "@/lib/queryKeys";
import { timeAgo } from "@/lib/timeAgo";
import { useFilesKeyboard } from "@/hooks/useFilesKeyboard";
import { FilesLeftRail, type LeftRailScope } from "./FilesLeftRail";
import { FilesInspector } from "./FilesInspector";
import { FilesReader, type OpenTab } from "./FilesReader";
import { FilesOverview } from "./FilesOverview";
import { FilesQuickOpen } from "./FilesQuickOpen";
import { cn } from "@/lib/utils";

export type FilesMode = "overview" | "reader";

export interface FilesShellProps {
  companyId: string;
  mode: FilesMode;
  onModeChange: (mode: FilesMode) => void;
  scope: LeftRailScope;
  onScopeChange: (scope: LeftRailScope) => void;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  agentFilter: string | null;
  onAgentFilter: (id: string | null) => void;
  /** Seed the reader with a specific file/version (from deep link). */
  initialFile?: { filePath: string; contentHash: string | null } | null;
}

export function FilesShell({
  companyId,
  mode,
  onModeChange,
  scope,
  onScopeChange,
  selectedProjectId,
  onSelectProject,
  agentFilter,
  onAgentFilter,
  initialFile,
}: FilesShellProps) {
  const [tabs, setTabs] = useState<OpenTab[]>(initialFile ? [initialFile] : []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [railVisible, setRailVisible] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const seededRef = useRef<string | null>(null);

  // Seed tabs from an incoming deep link, once.
  useEffect(() => {
    if (!initialFile || !initialFile.filePath) return;
    const key = `${initialFile.filePath}::${initialFile.contentHash ?? ""}`;
    if (seededRef.current === key) return;
    seededRef.current = key;
    openFile(initialFile.filePath, initialFile.contentHash ?? null);
    onModeChange("reader");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile?.filePath, initialFile?.contentHash]);

  const active = tabs[activeIdx] ?? null;

  const openFile = useCallback((filePath: string, contentHash: string | null = null) => {
    setTabs((prev) => {
      const existing = prev.findIndex((t) => t.filePath === filePath);
      if (existing >= 0) {
        setActiveIdx(existing);
        if (contentHash != null) {
          const clone = [...prev];
          clone[existing] = { ...clone[existing], contentHash };
          return clone;
        }
        return prev;
      }
      const next = [...prev, { filePath, contentHash }];
      setActiveIdx(next.length - 1);
      return next;
    });
    onModeChange("reader");
  }, [onModeChange]);

  const closeTab = useCallback((idx: number) => {
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx((cur) => {
        if (next.length === 0) return 0;
        if (idx < cur) return cur - 1;
        if (idx === cur) return Math.max(0, cur - (idx === prev.length - 1 ? 1 : 0));
        return cur;
      });
      return next;
    });
  }, []);

  const onPickHash = useCallback((hash: string) => {
    setTabs((prev) => {
      if (prev.length === 0) return prev;
      const clone = [...prev];
      const cur = clone[activeIdx];
      if (!cur) return prev;
      clone[activeIdx] = { ...cur, contentHash: hash };
      return clone;
    });
  }, [activeIdx]);

  // ── Indexing + presence feed the status bar ─────────────────────────
  const { data: indexing } = useQuery({
    queryKey: queryKeys.files.indexingStatus(companyId),
    queryFn: () => filesApi.indexingStatus(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: presence = [] } = useQuery({
    queryKey: queryKeys.files.presence(companyId),
    queryFn: () => filesApi.presence(companyId),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });

  // Keyboard wiring.
  useFilesKeyboard({
    onQuickOpen: () => setQuickOpen((v) => !v),
    onMode: (m) => onModeChange(m),
    onToggleInspector: () => setInspectorVisible((v) => !v),
    onToggleLeftRail: () => setRailVisible((v) => !v),
    onOlderVersion: () => advanceVersion(+1),
    onNewerVersion: () => advanceVersion(-1),
    onGoOverview: () => onModeChange("overview"),
    isBlocked: () => quickOpen,
  });

  // Version advance uses current tab's history via a dedicated fetch.
  const advanceVersion = useCallback((dir: 1 | -1) => {
    if (!active) return;
    // Defer to the reader by looking at its history via query cache.
    // We rely on the presence of the existing query.
    const key = queryKeys.files.history(companyId, active.filePath);
    // Simple implementation: trigger a pick on adjacent snapshot using
    // the reader-side logic by dispatching a custom event.
    window.dispatchEvent(new CustomEvent("files-version-nav", { detail: { dir, key } }));
  }, [active, companyId]);

  // Reader listens for the version-nav event and resolves it via the
  // react-query cache. Wire that here in the shell to keep FilesReader
  // stateless.
  useEffect(() => {
    function onNav(ev: Event) {
      const detail = (ev as CustomEvent).detail as { dir: 1 | -1 } | undefined;
      if (!detail || !active) return;
      // Lazy-access the cache via react-query hook is not available
      // outside a component; instead we read current history via a
      // tiny refetch. This is cheap because the query is already
      // warm.
      filesApi.history(companyId, active.filePath).then((history) => {
        if (!history.length) return;
        const idx = active.contentHash
          ? history.findIndex((h) => h.contentHash === active.contentHash)
          : 0;
        const nextIdx = Math.max(0, Math.min(history.length - 1, (idx < 0 ? 0 : idx) + detail.dir));
        const target = history[nextIdx]?.contentHash;
        if (target) onPickHash(target);
      }).catch(() => {});
    }
    window.addEventListener("files-version-nav", onNav);
    return () => window.removeEventListener("files-version-nav", onNav);
  }, [companyId, active, onPickHash]);

  const scopeForRail = scope;
  const fileScope: FileScope = useMemo(() => {
    if (scope === "artifacts" || scope === "projects" || scope === "agents") return "general";
    return scope;
  }, [scope]);

  return (
    <div className="flex flex-col min-h-0 h-[calc(100vh-var(--boared-top-offset,8rem))]">
      <div className="h-11 flex items-center gap-3 border-b border-[var(--boared-rule)] px-3 bg-[var(--boared-paper-2)]">
        <div
          role="tablist"
          aria-label="Files mode"
          className="inline-flex items-stretch rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-[2px] gap-[2px]"
        >
          <ModeTab
            active={mode === "overview"}
            onClick={() => onModeChange("overview")}
            icon={Layout}
            label="Overview"
            shortcut="⌘1"
          />
          <ModeTab
            active={mode === "reader"}
            onClick={() => onModeChange("reader")}
            icon={FileText}
            label="Reader"
            shortcut="⌘2"
          />
        </div>

        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className={cn(
            "group flex-1 min-w-0 max-w-md inline-flex items-center gap-2 h-7 px-2.5",
            "rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper)]",
            "text-[0.72rem] text-muted-foreground hover:text-foreground hover:border-foreground/40",
            "transition-colors",
          )}
          title="Quick open (⌘P)"
          aria-label="Quick open file"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Jump to file…</span>
          <span className="ml-auto flex items-center gap-0.5 shrink-0">
            <kbd className="font-mono text-[0.55rem] px-1 py-[1px] border border-[var(--boared-rule)] rounded-sm bg-[var(--boared-paper-2)]">⌘</kbd>
            <kbd className="font-mono text-[0.55rem] px-1 py-[1px] border border-[var(--boared-rule)] rounded-sm bg-[var(--boared-paper-2)]">P</kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1 pl-3 border-l border-[var(--boared-rule)]/70">
          <PanelToggle
            active={railVisible}
            onClick={() => setRailVisible((v) => !v)}
            icon={PanelLeft}
            label="Navigation"
            shortcut="T"
          />
          <PanelToggle
            active={inspectorVisible}
            onClick={() => setInspectorVisible((v) => !v)}
            icon={PanelRight}
            label="Inspector"
            shortcut="O"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid" style={{
        gridTemplateColumns: buildCols(railVisible, mode === "reader" && inspectorVisible),
      }}>
        {railVisible && (
          <FilesLeftRail
            companyId={companyId}
            scope={scopeForRail}
            onScopeChange={onScopeChange}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
            agentFilter={agentFilter}
            onAgentFilter={onAgentFilter}
            selectedPath={active?.filePath ?? null}
            onSelectFile={(path) => openFile(path)}
            search={search}
            onSearchChange={setSearch}
            className="row-span-1"
          />
        )}

        <main className="min-h-0 overflow-auto">
          {mode === "overview" ? (
            <div className="px-6 pt-6">
              <FilesOverview
                companyId={companyId}
                onOpenFile={(p) => openFile(p)}
                onOpenProject={(id) => {
                  onScopeChange("projects");
                  onSelectProject(id);
                }}
                onSwitchToReader={() => onModeChange("reader")}
              />
            </div>
          ) : (
            <FilesReader
              companyId={companyId}
              tabs={tabs}
              activeIndex={activeIdx}
              onActivate={setActiveIdx}
              onCloseTab={closeTab}
              onPickHash={onPickHash}
              className="h-full"
            />
          )}
        </main>

        {mode === "reader" && inspectorVisible && (
          <FilesInspector
            companyId={companyId}
            filePath={active?.filePath ?? null}
            activeHash={active?.contentHash}
            onPickHash={onPickHash}
            className="border-l border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
          />
        )}
      </div>

      <StatusBar
        indexing={indexing}
        liveCount={presence.length}
        mode={mode}
        fileScope={fileScope}
        openCount={tabs.length}
      />

      <FilesQuickOpen
        companyId={companyId}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onPick={(path) => openFile(path)}
      />
    </div>
  );
}

function buildCols(rail: boolean, inspector: boolean): string {
  const parts: string[] = [];
  if (rail) parts.push("17rem");
  parts.push("minmax(0, 1fr)");
  if (inspector) parts.push("18rem");
  return parts.join(" ");
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-[0.72rem] font-medium transition-colors",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      <kbd
        className={cn(
          "font-mono text-[0.55rem] px-1 py-[1px] rounded-sm border",
          active
            ? "border-background/30 text-background/70"
            : "border-[var(--boared-rule)] text-muted-foreground/70",
        )}
      >
        {shortcut}
      </kbd>
    </button>
  );
}

function PanelToggle({
  active,
  onClick,
  icon: Icon,
  label,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Toggle ${label} (${shortcut})`}
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors",
        active
          ? "border-[var(--boared-rule)] text-foreground bg-[var(--boared-paper)]"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function StatusBar({
  indexing,
  liveCount,
  mode,
  fileScope,
  openCount,
}: {
  indexing: { pendingRuns: number; indexedRuns: number; totalCompletedRuns: number; lastBackfillAt: string | null } | undefined;
  liveCount: number;
  mode: FilesMode;
  fileScope: FileScope;
  openCount: number;
}) {
  const indexHealthy = indexing && indexing.pendingRuns === 0;
  return (
    <footer className="flex items-center gap-4 border-t border-[var(--boared-rule)] px-3 h-6 bg-[var(--boared-paper-2)] text-[0.58rem] font-mono text-muted-foreground select-none">
      <StatusField label="scope" value={fileScope} />
      <StatusField label="mode" value={mode} />
      <StatusField label="open" value={String(openCount)} />

      <div className="ml-auto flex items-center gap-4">
        <span className="flex items-center gap-1.5" aria-live="polite">
          <Radio className={cn("h-3 w-3", liveCount > 0 ? "text-cyan-300 animate-pulse" : "text-muted-foreground/50")} />
          <span className={liveCount > 0 ? "text-foreground" : undefined}>{liveCount}</span>
          <span>live</span>
        </span>
        {indexing && (
          <span className="flex items-center gap-1.5" title={indexing.lastBackfillAt ? `Last backfill ${timeAgo(indexing.lastBackfillAt)}` : undefined}>
            {indexHealthy ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <AlertCircle className="h-3 w-3 text-[var(--boared-acid)]" />
            )}
            <span className="tabular-nums text-foreground">
              {indexing.indexedRuns}/{indexing.totalCompletedRuns}
            </span>
            <span>indexed</span>
          </span>
        )}
        <span className="hidden md:flex items-center gap-1 pl-3 border-l border-[var(--boared-rule)]/70">
          <span className="uppercase tracking-[0.08em] text-muted-foreground/70 mr-1">keys</span>
          <Kbd>⌘P</Kbd>
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <Kbd>[</Kbd>
          <Kbd>]</Kbd>
        </span>
      </div>
    </footer>
  );
}

function StatusField({ label, value }: { label: string; value: string }) {
  return (
    <span className="uppercase tracking-[0.08em]">
      {label}: <span className="text-foreground normal-case">{value}</span>
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[0.55rem] min-w-[1rem] text-center px-1 py-[1px] border border-[var(--boared-rule)] rounded-sm bg-[var(--boared-paper)]">
      {children}
    </kbd>
  );
}
