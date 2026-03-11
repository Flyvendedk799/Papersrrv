import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Clock, User, FileQuestion, RefreshCw, FileCode, FileText,
  FileJson, BookOpen, Settings, LayoutGrid, List, FolderTree, X,
} from "lucide-react";
import { useSearchParams } from "@/lib/router";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { EmptyState } from "../components/EmptyState";
import { FileViewerModal } from "../components/FileViewerModal";
import { MarkdownBody } from "../components/MarkdownBody";
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

  // Remove empty categories
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
          className="flex items-center gap-1.5 w-full px-2 py-1 text-[13px] hover:bg-accent/50 rounded-sm transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-blue-500 shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
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
      ? "text-green-500"
      : node.lastOperation === "edit"
        ? "text-yellow-500"
        : node.lastOperation === "delete"
          ? "text-red-500"
          : "text-muted-foreground";

  const Icon = fileIcon(node.path);

  return (
    <button
      onClick={() => onSelect(node.path)}
      className="flex items-center gap-1.5 w-full px-2 py-1 text-[13px] hover:bg-accent/50 rounded-sm transition-colors group"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" />
      <Icon className={cn("h-4 w-4 shrink-0", opColor)} />
      <span className="truncate">{node.name}</span>
      {node.lastAgent && (
        <span className="ml-auto text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[120px]">
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
}: {
  companyId: string;
  filePath: string;
  contentHash: string | null;
  onClose: () => void;
  onOpenModal: () => void;
}) {
  const { data: content, isLoading } = useQuery({
    queryKey: queryKeys.files.content(companyId, contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, contentHash!),
    enabled: !!contentHash,
  });

  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{filePath}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenModal}
            className="px-2 py-1 text-[11px] rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            Full view
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : !content ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No content available.</div>
        ) : content.isMarkdown ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownBody>{content.content}</MarkdownBody>
          </div>
        ) : (
          <pre className="text-xs font-mono bg-muted/30 rounded-md p-4 overflow-x-auto whitespace-pre-wrap break-words">
            {content.content}
          </pre>
        )}
      </div>
    </div>
  );
}

// --- Main page ---

export function Files() {
  const { selectedCompanyId } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; hash: string | null } | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "list" | "categories">("tree");

  // Open file from URL ?file= param
  useEffect(() => {
    const fileParam = searchParams.get("file");
    if (fileParam) {
      setSelectedFilePath(fileParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: queryKeys.files.tree(selectedCompanyId!),
    queryFn: () => filesApi.tree(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: queryKeys.files.list(selectedCompanyId!),
    queryFn: () => filesApi.list(selectedCompanyId!),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.tree(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.list(selectedCompanyId!) });
    },
  });

  const handleFileSelect = (path: string) => {
    // For markdown files, show inline preview; for others, open modal
    if (isMarkdownFile(path)) {
      const file = files?.find((f) => f.filePath === path);
      setPreviewFile({ path, hash: file?.latestSnapshot.contentHash ?? null });
    } else {
      setSelectedFilePath(path);
    }
  };

  const showPreview = previewFile !== null;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Files</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              onClick={() => setViewMode("tree")}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
                viewMode === "tree"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Tree view"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Tree
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-input flex items-center gap-1",
                viewMode === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("categories")}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-input flex items-center gap-1",
                viewMode === "categories"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Category view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Categories
            </button>
          </div>
          <button
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            className="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1.5"
            title="Index files from past agent runs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", backfillMutation.isPending && "animate-spin")} />
            {backfillMutation.isPending ? "Indexing..." : "Index past runs"}
          </button>
        </div>
      </div>

      {backfillMutation.isSuccess && (
        <div className="mb-4 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-300">
          Indexed {backfillMutation.data.totalIndexed} files from {backfillMutation.data.runsProcessed} runs.
          {backfillMutation.data.failed > 0 && ` (${backfillMutation.data.failed} failed)`}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading files...</div>
      ) : !files?.length ? (
        <EmptyState icon={FileQuestion} message="No files indexed yet. Files will appear here as agents read and write files during their runs." />
      ) : (
        <div className={cn("flex gap-0", showPreview ? "h-[calc(100vh-180px)]" : "")}>
          {/* File browser (left side) */}
          <div className={cn(
            "rounded-lg border border-border bg-card overflow-auto",
            showPreview ? "w-2/5 shrink-0" : "w-full",
          )}>
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
              <div className="divide-y divide-border">
                {filteredFiles.map((file) => (
                  <FileListRow
                    key={file.filePath}
                    file={file}
                    onSelect={() => handleFileSelect(file.filePath)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
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

          {/* Markdown preview (right side) */}
          {showPreview && selectedCompanyId && (
            <div className="flex-1 min-w-0 rounded-lg border border-border bg-card overflow-hidden ml-0 border-l-0 rounded-l-none">
              <MarkdownPreview
                companyId={selectedCompanyId}
                filePath={previewFile.path}
                contentHash={previewFile.hash}
                onClose={() => setPreviewFile(null)}
                onOpenModal={() => {
                  setSelectedFilePath(previewFile.path);
                  setPreviewFile(null);
                }}
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
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-accent/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{category}</span>
        <span className="ml-auto text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {files.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/50">
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
    file.latestSnapshot.operation === "write"
      ? "bg-green-500/10 text-green-600"
      : file.latestSnapshot.operation === "edit"
        ? "bg-yellow-500/10 text-yellow-600"
        : file.latestSnapshot.operation === "delete"
          ? "bg-red-500/10 text-red-600"
          : "bg-muted text-muted-foreground";

  const Icon = fileIcon(file.filePath);
  const isMd = isMarkdownFile(file.filePath);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 w-full px-4 text-left hover:bg-accent/50 transition-colors",
        compact ? "py-1.5 pl-10" : "py-2.5",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isMd ? "text-blue-500" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium truncate", compact ? "text-xs" : "text-sm")}>
          {file.filePath}
        </div>
        {!compact && (
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {file.latestSnapshot.agentName ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(file.latestSnapshot.capturedAt).toLocaleString()}
            </span>
            <span>{file.snapshotCount} snapshot{file.snapshotCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0", opBadge)}>
        {file.latestSnapshot.operation}
      </span>
    </button>
  );
}
