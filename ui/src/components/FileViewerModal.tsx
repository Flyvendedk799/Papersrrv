import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Clock, User, GitCommitHorizontal, FileText } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "./MarkdownBody";
import { cn } from "../lib/utils";
import type { FileSnapshot } from "@paperclipai/shared";

interface FileViewerModalProps {
  companyId: string;
  filePath: string;
  onClose: () => void;
}

export function FileViewerModal({ companyId, filePath, onClose }: FileViewerModalProps) {
  const [activeTab, setActiveTab] = useState<"content" | "history">("content");
  const [selectedSnapshotHash, setSelectedSnapshotHash] = useState<string | null>(null);

  const { data: history } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath),
    queryFn: () => filesApi.history(companyId, filePath),
  });

  // Use selected snapshot hash, or the latest from history
  const contentHash = selectedSnapshotHash ?? history?.[0]?.contentHash ?? null;

  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: queryKeys.files.content(companyId, contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, contentHash!),
    enabled: !!contentHash,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-background rounded-lg border border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{filePath}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveTab("content")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "content"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Content
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "history"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            History{history ? ` (${history.length})` : ""}
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto min-h-0">
          {activeTab === "content" ? (
            <div className="p-4">
              {contentLoading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Loading content...
                </div>
              ) : !content ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No content available for this file.
                </div>
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
          ) : (
            <div className="divide-y divide-border">
              {history?.map((snapshot) => (
                <SnapshotRow
                  key={snapshot.id}
                  snapshot={snapshot}
                  isActive={snapshot.contentHash === contentHash}
                  onSelect={() => {
                    if (snapshot.contentHash) {
                      setSelectedSnapshotHash(snapshot.contentHash);
                      setActiveTab("content");
                    }
                  }}
                />
              ))}
              {!history?.length && (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No history available.
                </div>
              )}
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
  onSelect,
}: {
  snapshot: FileSnapshot;
  isActive: boolean;
  onSelect: () => void;
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
    <button
      onClick={onSelect}
      disabled={!snapshot.contentHash}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors",
        snapshot.contentHash ? "hover:bg-accent/50 cursor-pointer" : "opacity-60 cursor-default",
        isActive && "bg-accent/30",
      )}
    >
      <GitCommitHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", opBadge)}>
            {snapshot.operation}
          </span>
          {snapshot.contentHash && (
            <span className="text-[11px] text-muted-foreground font-mono">
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
  );
}
