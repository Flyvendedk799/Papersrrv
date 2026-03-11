import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Clock, User, GitCommitHorizontal, FileText, Edit3, Eye,
  Save, RotateCcw, GitCompare, ChevronLeft, ChevronRight,
} from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MarkdownBody } from "./MarkdownBody";
import { cn } from "../lib/utils";
import type { FileSnapshot } from "@paperclipai/shared";

interface FileViewerModalProps {
  companyId: string;
  filePath: string;
  onClose: () => void;
}

// Simple line-by-line diff
interface DiffLine {
  type: "same" | "add" | "remove";
  lineNum?: number;
  content: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const changes: Array<{ type: "same" | "add" | "remove"; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.unshift({ type: "same", line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      changes.unshift({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }

  let lineNum = 0;
  for (const change of changes) {
    if (change.type !== "remove") lineNum++;
    result.push({ type: change.type, lineNum: change.type !== "remove" ? lineNum : undefined, content: change.line });
  }

  return result;
}

// Syntax highlighting via CSS classes (lightweight, no dependency)
function highlightCode(content: string, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const isCode = /^(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|cs|rb|php|sh|bash|zsh|yaml|yml|json|toml)$/.test(ext);
  if (!isCode) return escapeHtml(content);

  // Basic keyword highlighting
  let escaped = escapeHtml(content);

  // Strings
  escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span class="text-green-600 dark:text-green-400">$&</span>');

  // Comments (single-line)
  escaped = escaped.replace(/(\/\/.*$|#.*$)/gm, '<span class="text-muted-foreground italic">$&</span>');

  // Keywords
  const keywords = /\b(function|const|let|var|if|else|return|import|export|from|class|interface|type|async|await|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|super|extends|implements|def|self|print|lambda|yield|with|as|in|of|true|false|null|undefined|None|True|False)\b/g;
  escaped = escaped.replace(keywords, '<span class="text-violet-600 dark:text-violet-400 font-medium">$&</span>');

  // Numbers
  escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-amber-600 dark:text-amber-400">$&</span>');

  return escaped;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function FileViewerModal({ companyId, filePath, onClose }: FileViewerModalProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<"content" | "edit" | "history" | "diff">("content");
  const [selectedSnapshotHash, setSelectedSnapshotHash] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [editDirty, setEditDirty] = useState(false);
  const [diffFrom, setDiffFrom] = useState<string | null>(null);
  const [diffTo, setDiffTo] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (content: string) => filesApi.saveContent(companyId, filePath, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.history(companyId, filePath) });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.tree(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.raw(companyId, filePath) });
      setEditDirty(false);
      setSelectedSnapshotHash(null);
      setActiveTab("content");
      pushToast({ title: "File saved", body: filePath.split(/[\\/]/).pop(), tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to save file", body: (err as Error).message, tone: "error" });
    },
  });

  const { data: history } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath),
    queryFn: () => filesApi.history(companyId, filePath),
  });

  const contentHash = selectedSnapshotHash ?? history?.[0]?.contentHash ?? null;

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

  // Diff content fetching
  const { data: diffFromContent } = useQuery({
    queryKey: queryKeys.files.content(companyId, diffFrom ?? ""),
    queryFn: () => filesApi.content(companyId, diffFrom!),
    enabled: !!diffFrom,
  });

  const { data: diffToContent } = useQuery({
    queryKey: queryKeys.files.content(companyId, diffTo ?? ""),
    queryFn: () => filesApi.content(companyId, diffTo!),
    enabled: !!diffTo,
  });

  const diffLines = useMemo(() => {
    if (!diffFromContent?.content || !diffToContent?.content) return null;
    return computeDiff(diffFromContent.content, diffToContent.content);
  }, [diffFromContent, diffToContent]);

  const isMarkdown = filePath.toLowerCase().endsWith(".md") || filePath.toLowerCase().endsWith(".mdx");

  const startEditing = () => {
    if (displayContent) {
      setEditContent(displayContent.content);
      setEditDirty(false);
      setActiveTab("edit");
    }
  };

  // Start diff between two snapshots
  const startDiff = (fromHash: string, toHash: string) => {
    setDiffFrom(fromHash);
    setDiffTo(toHash);
    setActiveTab("diff");
  };

  // Get snapshot label
  const snapshotLabel = (hash: string | null) => {
    if (!hash || !history) return "Unknown";
    const snap = history.find(s => s.contentHash === hash);
    if (!snap) return hash.slice(0, 8);
    return `${snap.operation} by ${snap.agentName ?? "Unknown"} - ${new Date(snap.capturedAt).toLocaleDateString()}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] bg-background rounded-lg border border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{filePath}</span>
            {history && history.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {history.length} version{history.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {activeTab !== "edit" && displayContent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit
                  </button>
                </TooltipTrigger>
                <TooltipContent>Edit this file directly</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onClose}
                  className="p-1 rounded-sm hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          {([
            { key: "content" as const, label: "Content", icon: Eye },
            { key: "edit" as const, label: "Edit", icon: Edit3 },
            { key: "history" as const, label: `History${history ? ` (${history.length})` : ""}`, icon: Clock },
            { key: "diff" as const, label: "Diff", icon: GitCompare },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                if (key === "edit" && !editDirty) startEditing();
                else setActiveTab(key);
              }}
              className={cn(
                "px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                activeTab === key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto min-h-0">
          {/* VIEW TAB */}
          {activeTab === "content" && (
            <div className="p-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Loading content...</div>
              ) : !displayContent ? (
                <div className="text-sm text-muted-foreground py-8 text-center">No content available.</div>
              ) : isMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {needsRawFallback && (
                    <div className="text-xs text-muted-foreground mb-3 italic">
                      Showing file from disk — not yet indexed.
                    </div>
                  )}
                  <MarkdownBody>{displayContent.content}</MarkdownBody>
                </div>
              ) : (
                <>
                  {needsRawFallback && (
                    <div className="text-xs text-muted-foreground mb-3 italic">
                      Showing file from disk — not yet indexed.
                    </div>
                  )}
                  <div className="rounded-md bg-muted/30 overflow-x-auto">
                    <pre
                      className="text-xs font-mono p-4 whitespace-pre-wrap break-words leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: highlightCode(displayContent.content, filePath) }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* EDIT TAB */}
          {activeTab === "edit" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <span className="text-xs text-muted-foreground">
                  {editDirty ? "Unsaved changes" : "Editing"}
                </span>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (displayContent) {
                            setEditContent(displayContent.content);
                            setEditDirty(false);
                          }
                        }}
                        disabled={!editDirty}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Discard changes and revert to original</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => saveMutation.mutate(editContent)}
                        disabled={!editDirty || saveMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        {saveMutation.isPending ? "Saving..." : "Save"}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes to disk</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {saveMutation.error && (
                <div className="px-4 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border-b border-red-200">
                  {(saveMutation.error as Error).message}
                </div>
              )}
              <textarea
                className="flex-1 w-full p-4 text-xs font-mono bg-background resize-none focus:outline-none leading-relaxed"
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); setEditDirty(true); }}
                spellCheck={false}
              />
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div>
              {history && history.length >= 2 && (
                <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  Click any version to view it. Select two versions to compare.
                </div>
              )}
              <div className="divide-y divide-border">
                {history?.map((snapshot, idx) => (
                  <SnapshotRow
                    key={snapshot.id}
                    snapshot={snapshot}
                    isActive={snapshot.contentHash === contentHash}
                    isLatest={idx === 0}
                    onSelect={() => {
                      if (snapshot.contentHash) {
                        setSelectedSnapshotHash(snapshot.contentHash);
                        setActiveTab("content");
                      }
                    }}
                    onCompare={idx > 0 && history[idx - 1].contentHash && snapshot.contentHash
                      ? () => startDiff(snapshot.contentHash!, history[idx - 1].contentHash!)
                      : undefined
                    }
                  />
                ))}
                {!history?.length && (
                  <div className="text-sm text-muted-foreground py-8 text-center">No history available.</div>
                )}
              </div>
            </div>
          )}

          {/* DIFF TAB */}
          {activeTab === "diff" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-red-500 font-medium">- {snapshotLabel(diffFrom)}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-green-500 font-medium">+ {snapshotLabel(diffTo)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-0">
                {!diffLines ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    {!diffFrom || !diffTo
                      ? "Select two versions from the History tab to compare."
                      : "Loading diff..."}
                  </div>
                ) : (
                  <div className="font-mono text-xs">
                    {diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex",
                          line.type === "add" && "bg-green-500/10",
                          line.type === "remove" && "bg-red-500/10",
                        )}
                      >
                        <span className={cn(
                          "w-10 shrink-0 text-right pr-2 py-0.5 select-none border-r border-border/50",
                          line.type === "add" ? "text-green-600 bg-green-500/5" :
                          line.type === "remove" ? "text-red-600 bg-red-500/5" :
                          "text-muted-foreground",
                        )}>
                          {line.lineNum ?? " "}
                        </span>
                        <span className={cn(
                          "w-6 shrink-0 text-center py-0.5 select-none",
                          line.type === "add" ? "text-green-600" :
                          line.type === "remove" ? "text-red-600" :
                          "text-muted-foreground",
                        )}>
                          {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                        </span>
                        <span className="flex-1 py-0.5 pr-4 whitespace-pre-wrap break-words">
                          {line.content}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SnapshotRow({
  snapshot,
  isActive,
  isLatest,
  onSelect,
  onCompare,
}: {
  snapshot: FileSnapshot;
  isActive: boolean;
  isLatest: boolean;
  onSelect: () => void;
  onCompare?: () => void;
}) {
  const opBadge =
    snapshot.operation === "write"
      ? "bg-green-500/10 text-green-600"
      : snapshot.operation === "edit"
        ? "bg-yellow-500/10 text-yellow-600"
        : snapshot.operation === "delete"
          ? "bg-red-500/10 text-red-600"
          : "bg-muted text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 transition-colors group",
        isActive && "bg-accent/30",
      )}
    >
      <button
        onClick={onSelect}
        disabled={!snapshot.contentHash}
        className={cn(
          "flex items-center gap-3 flex-1 min-w-0 text-left",
          snapshot.contentHash ? "hover:opacity-80 cursor-pointer" : "opacity-60 cursor-default",
        )}
      >
        <GitCommitHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", opBadge)}>
              {snapshot.operation}
            </span>
            {isLatest && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600">
                Latest
              </span>
            )}
            {snapshot.contentHash && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {snapshot.contentHash.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {snapshot.agentName ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(snapshot.capturedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </button>
      {onCompare && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCompare}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border hover:bg-accent transition-all shrink-0"
            >
              <GitCompare className="h-3 w-3" />
              Diff
            </button>
          </TooltipTrigger>
          <TooltipContent>Compare with previous version</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
