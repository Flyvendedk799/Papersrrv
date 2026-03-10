import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, File, Folder, FolderOpen, ChevronRight, ChevronDown, Clock, User, FileQuestion } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { EmptyState } from "../components/EmptyState";
import { FileViewerModal } from "../components/FileViewerModal";
import { cn } from "../lib/utils";
import type { FileTreeNode, FileWithHistory } from "@paperclipai/shared";

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

  return (
    <button
      onClick={() => onSelect(node.path)}
      className="flex items-center gap-1.5 w-full px-2 py-1 text-[13px] hover:bg-accent/50 rounded-sm transition-colors group"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" />
      <File className={cn("h-4 w-4 shrink-0", opColor)} />
      <span className="truncate">{node.name}</span>
      {node.lastAgent && (
        <span className="ml-auto text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[120px]">
          {node.lastAgent}
        </span>
      )}
    </button>
  );
}

export function Files() {
  const { selectedCompanyId } = useCompany();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");

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

  const isLoading = treeLoading || filesLoading;

  return (
    <div className="max-w-6xl mx-auto">
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
                "px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "tree"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors border-l border-input",
                viewMode === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading files...</div>
      ) : !files?.length ? (
        <EmptyState icon={FileQuestion} message="No files indexed yet. Files will appear here as agents read and write files during their runs." />
      ) : viewMode === "tree" ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="p-2">
            {tree?.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                onSelect={setSelectedFilePath}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filteredFiles.map((file) => (
            <FileListRow
              key={file.filePath}
              file={file}
              onSelect={() => setSelectedFilePath(file.filePath)}
            />
          ))}
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

function FileListRow({
  file,
  onSelect,
}: {
  file: FileWithHistory;
  onSelect: () => void;
}) {
  const opBadge =
    file.latestSnapshot.operation === "write"
      ? "bg-green-500/10 text-green-600"
      : file.latestSnapshot.operation === "edit"
        ? "bg-yellow-500/10 text-yellow-600"
        : file.latestSnapshot.operation === "delete"
          ? "bg-red-500/10 text-red-600"
          : "bg-muted text-muted-foreground";

  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
    >
      <File className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{file.filePath}</div>
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
      </div>
      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", opBadge)}>
        {file.latestSnapshot.operation}
      </span>
    </button>
  );
}
