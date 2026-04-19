import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Clock, User, FileQuestion, RefreshCw, FileCode, FileText,
  FileJson, BookOpen, Settings, LayoutGrid, List, FolderTree, X,
  Bot,
} from "lucide-react";
import { useSearchParams } from "@/lib/router";
import { PageHeader } from "@/components/boared/PageHeader";
import { filesApi } from "../api/files";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { EmptyState } from "../components/EmptyState";
import { FileViewerModal } from "../components/FileViewerModal";
import { MarkdownBody } from "../components/MarkdownBody";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "../lib/utils";
import type { FileTreeNode, FileWithHistory } from "@paperclipai/shared";

// --- File categorization ---

interface FileCategory {
  label: string;
  icon: typeof File;
  test: (path: string) => boolean;
}

const FILE_CATEGORIES: FileCategory[] = [
  { label: "Standards", icon: BookOpen, test: (p) => /standards?\b/i.test(p) },
  { label: "Handbooks", icon: BookOpen, test: (p) => /handbooks?\b/i.test(p) },
  { label: "Documentation", icon: FileText, test: (p) => /\.(md|mdx|markdown)$/i.test(p) },
  { label: "Configuration", icon: Settings, test: (p) => /\.(json|yaml|yml|toml|ini|env|config\..*|rc)$/i.test(p) || /\.env\b/i.test(p) },
  { label: "Source Code", icon: FileCode, test: (p) => /\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp|cs|rb|php|swift|kt|scala|sh|bash|zsh)$/i.test(p) },
  { label: "Data", icon: FileJson, test: (p) => /\.(csv|tsv|sql|xml|graphql|proto)$/i.test(p) },
  { label: "Other", icon: File, test: () => true },
];

function categorizeFiles(files: FileWithHistory[]): Map<string, FileWithHistory[]> {
  const groups = new Map<string, FileWithHistory[]>();
  for (const cat of FILE_CATEGORIES) groups.set(cat.label, []);

  for (const file of files) {
    for (const cat of FILE_CATEGORIES) {
      if (cat.test(file.filePath)) {
        groups.get(cat.label)!.push(file);
        break;
      }
    }
  }

  for (const [key, value] of groups) {
    if (value.length === 0) groups.delete(key);
  }
  return groups;
}

function fileIcon(path: string) {
  const lower = path.toLowerCase();
  if (/\.(md|mdx|markdown)$/.test(lower)) return FileText;
  if (/\.(json|yaml|yml|toml)$/.test(lower)) return FileJson;
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|cs|rb|php)$/.test(lower)) return FileCode;
  if (/\.(ini|env|config)/.test(lower)) return Settings;
  return File;
}

function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function isReferenceFile(path: string): boolean {
  return /standards?\b/i.test(path)
    || /handbooks?\b/i.test(path)
    || /AGENTS\.md$/i.test(path)
    || /HEARTBEAT\.md$/i.test(path)
    || /README\.md$/i.test(path);
}

// --- Tree item ---

function FileTreeItem({
  node,
  depth,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-[13px] hover:bg-foreground/[0.03] transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 text-foreground shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-foreground shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
          {node.children && (
            <span className="ml-auto text-[10px] text-muted-foreground">{node.children.length}</span>
          )}
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const opColor =
    node.lastOperation === "write"
      ? "text-foreground"
      : node.lastOperation === "edit"
        ? "text-foreground"
        : node.lastOperation === "delete"
          ? "text-[var(--boared-acid)]"
          : "text-muted-foreground";

  const Icon = fileIcon(node.path);

  return (
    <button
      onClick={() => onSelect(node.path)}
      className="flex items-center gap-1.5 w-full px-2 py-1 text-[13px] hover:bg-foreground/[0.03] transition-colors group"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" />
      <Icon className={cn("h-4 w-4 shrink-0", opColor)} />
      <span className="truncate">{node.name}</span>
      {node.lastAgent && (
        <span className="ml-auto text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[120px]">
          {node.lastAgent}
        </span>
      )}
    </button>
  );
}

// --- Inline markdown preview ---

function MarkdownPreview({
  companyId,
  filePath,
  contentHash,
  onClose,
  onOpenModal,
  agentName,
  operation,
}: {
  companyId: string;
  filePath: string;
  contentHash: string | null;
  onClose: () => void;
  onOpenModal: () => void;
  agentName?: string;
  operation?: string;
}) {
  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: queryKeys.files.content(companyId, contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, contentHash!),
    enabled: !!contentHash,
  });

  const needsRawFallback = !contentLoading && !content && !contentHash;
  const { data: rawContent, isLoading: rawLoading } = useQuery({
    queryKey: queryKeys.files.raw(companyId, filePath),
    queryFn: () => filesApi.rawContent(companyId, filePath),
    enabled: needsRawFallback,
    retry: false,
  });

  const displayContent = content ?? (rawContent ? { content: rawContent.content, isMarkdown: rawContent.isMarkdown } : null);
  const isLoading = contentLoading || (needsRawFallback && rawLoading);

  return (
    <div className="flex flex-col h-full border-l border-[var(--boared-rule)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--boared-rule)] shrink-0 bg-[var(--boared-paper-2)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{filePath}</span>
          {isReferenceFile(filePath) ? (
            <span className="px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[0.58rem] border border-foreground text-foreground shrink-0">
              Reference
            </span>
          ) : agentName ? (
            <span className="text-[10px] text-muted-foreground shrink-0">
              by {agentName}{operation ? ` (${operation})` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenModal}
            className="px-2 py-1 font-mono text-[0.62rem] hover:bg-foreground/[0.03] transition-colors text-muted-foreground hover:text-foreground"
          >
            Full view
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-foreground/[0.03] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : !displayContent ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No content available.</div>
        ) : (
          <>
            {needsRawFallback && (
              <div className="text-xs text-muted-foreground mb-3 italic">
                Showing file from disk — not yet indexed by an agent run.
              </div>
            )}
            {displayContent.isMarkdown ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownBody>{displayContent.content}</MarkdownBody>
              </div>
            ) : (
              <pre className="text-xs font-mono bg-[var(--boared-paper-2)] p-4 overflow-x-auto whitespace-pre-wrap break-words">
                {displayContent.content}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Main page ---

export function Files() {
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; hash: string | null } | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "list" | "categories">("tree");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [runIdFilter, setRunIdFilter] = useState<string | null>(null);

  // Open file from URL params: ?file= or ?runId=
  useEffect(() => {
    const fileParam = searchParams.get("file");
    const runIdParam = searchParams.get("runId");
    const agentParam = searchParams.get("agentId");
    if (fileParam) {
      setSelectedFilePath(fileParam);
      setSearchParams({}, { replace: true });
    }
    if (runIdParam) {
      setRunIdFilter(runIdParam);
      setViewMode("list");
      setSearchParams({}, { replace: true });
    }
    if (agentParam) {
      setAgentFilter(agentParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch agents for filter
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: [...queryKeys.files.tree(selectedCompanyId!), agentFilter],
    queryFn: () => filesApi.tree(selectedCompanyId!, agentFilter ?? undefined),
    enabled: !!selectedCompanyId,
  });

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: [...queryKeys.files.list(selectedCompanyId!), agentFilter, runIdFilter],
    queryFn: () => filesApi.list(selectedCompanyId!, {
      agentId: agentFilter ?? undefined,
      runId: runIdFilter ?? undefined,
    }),
    enabled: !!selectedCompanyId,
  });

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    if (!searchTerm) return files;
    const term = searchTerm.toLowerCase();
    return files.filter((f) => f.filePath.toLowerCase().includes(term));
  }, [files, searchTerm]);

  const categorized = useMemo(() => categorizeFiles(filteredFiles), [filteredFiles]);

  const isLoading = treeLoading || filesLoading;
  const queryClient = useQueryClient();

  const backfillMutation = useMutation({
    mutationFn: () => filesApi.backfill(selectedCompanyId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.tree(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.list(selectedCompanyId!) });
      pushToast({
        title: "Indexing complete",
        body: `${data.totalIndexed} files from ${data.runsProcessed} runs${data.failed > 0 ? ` (${data.failed} failed)` : ""}`,
        tone: data.failed > 0 ? "warn" : "success",
      });
    },
    onError: (err) => {
      pushToast({ title: "Indexing failed", body: (err as Error).message, tone: "error" });
    },
  });

  const handleFileSelect = (path: string) => {
    if (isMarkdownFile(path)) {
      const file = files?.find((f) => f.filePath === path);
      setPreviewFile({ path, hash: file?.latestSnapshot.contentHash ?? null });
    } else {
      setSelectedFilePath(path);
    }
  };

  const selectedAgentName = agents?.find(a => a.id === agentFilter)?.name;
  const showPreview = previewFile !== null;

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§17 · Files</>}
        title={<>The paper <em>trail.</em></>}
        dateline="Every file read or written by an agent."
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
                className="h-9 px-3 border border-foreground font-mono text-[0.7rem] tracking-tight text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", backfillMutation.isPending && "animate-spin")} />
                {backfillMutation.isPending ? "Indexing..." : "Reindex"}
              </button>
            </TooltipTrigger>
            <TooltipContent>Scan past agent runs and index any new files</TooltipContent>
          </Tooltip>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Agent filter pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setAgentFilter(null)}
            className={cn(
              "px-2.5 h-7 font-mono text-[0.66rem] tracking-tight border transition-colors",
              !agentFilter
                ? "bg-foreground text-background border-foreground"
                : "border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground",
            )}
          >
            All agents
          </button>
          {agents?.filter(a => a.status !== "terminated").map(agent => (
            <button
              key={agent.id}
              onClick={() => setAgentFilter(agentFilter === agent.id ? null : agent.id)}
              className={cn(
                "px-2.5 h-7 font-mono text-[0.66rem] tracking-tight border transition-colors flex items-center gap-1",
                agentFilter === agent.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground",
              )}
            >
              <Bot className="h-3 w-3" />
              {agent.name}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-56 border border-[var(--boared-rule)] bg-transparent pl-8 pr-3 font-mono text-[0.72rem] placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
          />
        </div>

        {/* View mode */}
        <div className="flex border border-[var(--boared-rule)] overflow-hidden">
          {([
            { mode: "tree" as const, icon: FolderTree, label: "Tree", tip: "Browse files as a folder tree" },
            { mode: "list" as const, icon: List, label: "List", tip: "View files as a flat list" },
            { mode: "categories" as const, icon: LayoutGrid, label: "Type", tip: "Group files by type" },
          ]).map(({ mode, icon: Icon, tip }) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-2 py-1.5 font-mono text-[0.66rem] transition-colors flex items-center gap-1",
                    mode !== "tree" && "border-l border-[var(--boared-rule)]",
                    viewMode === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Active filters */}
      {(runIdFilter || agentFilter) && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {runIdFilter && (
            <div className="border border-foreground px-3 py-1.5 font-mono text-[0.66rem] text-foreground flex items-center gap-2">
              <span>Run <code className="font-mono">{runIdFilter.slice(0, 8)}</code></span>
              <button onClick={() => setRunIdFilter(null)} className="hover:text-[var(--boared-acid)]">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {agentFilter && selectedAgentName && (
            <div className="border border-foreground px-3 py-1.5 font-mono text-[0.66rem] text-foreground flex items-center gap-2">
              <Bot className="h-3 w-3" />
              <span>{selectedAgentName}</span>
              <button onClick={() => setAgentFilter(null)} className="hover:text-[var(--boared-acid)]">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {backfillMutation.isSuccess && (
        <div className="mb-4 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] px-3 py-2 font-mono text-[0.7rem] text-foreground">
          Indexed {backfillMutation.data.totalIndexed} files from {backfillMutation.data.runsProcessed} runs.
          {backfillMutation.data.failed > 0 && ` (${backfillMutation.data.failed} failed)`}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading files...</div>
      ) : !files?.length ? (
        <EmptyState
          icon={FileQuestion}
          message={agentFilter
            ? `No files found for ${selectedAgentName ?? "this agent"}. Files appear as agents read and write during runs.`
            : "No files indexed yet. Files will appear here as agents read and write files during their runs."
          }
        />
      ) : (
        <div className={cn("flex gap-0", showPreview ? "h-[calc(100vh-220px)]" : "")}>
          {/* File browser */}
          <div className={cn(
            "border border-[var(--boared-rule)] overflow-auto",
            showPreview ? "w-2/5 shrink-0" : "w-full",
          )}>
            {/* File count */}
            <div className="px-3 py-2 border-b border-[var(--boared-rule)] bg-[var(--boared-paper-2)] font-mono uppercase tracking-[0.08em] text-[0.58rem] text-muted-foreground flex items-center justify-between">
              <span>{filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}</span>
              {searchTerm && <span>matching &quot;{searchTerm}&quot;</span>}
            </div>

            {viewMode === "tree" ? (
              <div className="p-2">
                {tree?.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    onSelect={handleFileSelect}
                  />
                ))}
              </div>
            ) : viewMode === "list" ? (
              <div className="divide-y divide-[var(--boared-rule)]">
                {filteredFiles.map((file) => (
                  <FileListRow
                    key={file.filePath}
                    file={file}
                    onSelect={() => handleFileSelect(file.filePath)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-[var(--boared-rule)]">
                {[...categorized.entries()].map(([category, categoryFiles]) => (
                  <CategorySection
                    key={category}
                    category={category}
                    icon={FILE_CATEGORIES.find((c) => c.label === category)?.icon ?? File}
                    files={categoryFiles}
                    onSelect={handleFileSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Markdown preview */}
          {showPreview && selectedCompanyId && (
            <div className="flex-1 min-w-0 border border-[var(--boared-rule)] overflow-hidden ml-0 border-l-0">
              <MarkdownPreview
                companyId={selectedCompanyId}
                filePath={previewFile.path}
                contentHash={previewFile.hash}
                onClose={() => setPreviewFile(null)}
                onOpenModal={() => {
                  setSelectedFilePath(previewFile.path);
                  setPreviewFile(null);
                }}
                agentName={files?.find((f) => f.filePath === previewFile.path)?.latestSnapshot.agentName ?? undefined}
                operation={files?.find((f) => f.filePath === previewFile.path)?.latestSnapshot.operation}
              />
            </div>
          )}
        </div>
      )}

      {selectedFilePath && selectedCompanyId && (
        <FileViewerModal
          companyId={selectedCompanyId}
          filePath={selectedFilePath}
          onClose={() => setSelectedFilePath(null)}
        />
      )}
    </div>
  );
}

// --- Category section ---

function CategorySection({
  category,
  icon: Icon,
  files,
  onSelect,
}: {
  category: string;
  icon: typeof File;
  files: FileWithHistory[];
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-foreground/[0.03] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-[0.82rem]">{category}</span>
        <span className="ml-auto font-mono uppercase tracking-[0.08em] text-[0.58rem] text-muted-foreground">
          {files.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--boared-rule)]">
          {files.map((file) => (
            <FileListRow
              key={file.filePath}
              file={file}
              onSelect={() => onSelect(file.filePath)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- File list row ---

function FileListRow({
  file,
  onSelect,
  compact,
}: {
  file: FileWithHistory;
  onSelect: () => void;
  compact?: boolean;
}) {
  const opBadge =
    file.latestSnapshot.operation === "delete"
      ? "border border-[var(--boared-acid)] text-[var(--boared-acid)]"
      : "border border-[var(--boared-rule)] text-muted-foreground";

  const borderColor =
    file.latestSnapshot.operation === "delete"
      ? "border-l-[var(--boared-acid)]"
      : file.latestSnapshot.operation === "write" || file.latestSnapshot.operation === "edit"
        ? "border-l-foreground"
        : "border-l-transparent";

  const Icon = fileIcon(file.filePath);
  const isMd = isMarkdownFile(file.filePath);
  const isRef = isReferenceFile(file.filePath);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 w-full px-4 text-left hover:bg-foreground/[0.03] transition-colors",
        compact ? "py-1.5 pl-10" : "py-2.5",
        !isRef && "border-l-2",
        !isRef && borderColor,
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isMd ? "text-foreground" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className={cn("truncate", compact ? "text-[0.72rem]" : "text-[0.82rem]")}>
          {file.filePath}
        </div>
        {!compact && (
          <div className="flex items-center gap-3 mt-0.5 font-mono text-[0.62rem] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {file.latestSnapshot.agentName ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(file.latestSnapshot.capturedAt).toLocaleString()}
            </span>
            <span>{file.snapshotCount} version{file.snapshotCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
      {isRef ? (
        <span className="px-2 py-0.5 font-mono uppercase tracking-[0.08em] text-[0.58rem] shrink-0 border border-foreground text-foreground">
          Reference
        </span>
      ) : (
        <span className={cn("px-2 py-0.5 font-mono uppercase tracking-[0.08em] text-[0.58rem] shrink-0", opBadge)}>
          {file.latestSnapshot.operation}
        </span>
      )}
    </button>
  );
}
