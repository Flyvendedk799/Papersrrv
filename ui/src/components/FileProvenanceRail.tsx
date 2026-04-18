/**
 * File provenance rail (backlog 2.0 C2).
 *
 * Renders a compact horizontal timeline of a file's snapshots with
 * who wrote/edited it, when, and which run. Lets reviewers jump
 * directly to any prior version. Used above FilePreview on the Files
 * page and optionally on the Issue detail inline preview.
 */

import { useQuery } from "@tanstack/react-query";
import { User, GitCommitHorizontal } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { useFeatureFlag } from "../lib/featureFlags";
import { cn } from "../lib/utils";

interface Props {
  companyId: string;
  filePath: string;
  /** Highlighted hash (currently viewing). */
  activeHash?: string | null;
  onPickHash?: (hash: string) => void;
  /** Limit snapshots shown. */
  limit?: number;
  className?: string;
}

export function FileProvenanceRail({
  companyId,
  filePath,
  activeHash,
  onPickHash,
  limit = 12,
  className,
}: Props) {
  const enabled = useFeatureFlag("provenance_rails");
  const { data: history } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath),
    queryFn: () => filesApi.history(companyId, filePath),
    enabled: enabled && !!companyId && !!filePath,
  });

  if (!enabled) return null;
  if (!history?.length) return null;

  const items = history.slice(0, limit);

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b border-[var(--boared-rule)] bg-[var(--boared-paper)]",
        className,
      )}
      role="list"
      aria-label="File history"
    >
      <span className="font-mono uppercase tracking-[0.08em] text-[0.55rem] text-muted-foreground shrink-0 pr-2">
        Provenance
      </span>
      {items.map((s) => {
        const active = s.contentHash === activeHash;
        const ts = new Date(s.capturedAt).toLocaleString();
        return (
          <button
            key={s.id}
            role="listitem"
            onClick={() => s.contentHash && onPickHash?.(s.contentHash)}
            title={`${s.agentName ?? s.agentId} · ${s.operation} · ${ts}`}
            className={cn(
              "shrink-0 flex items-center gap-1 border px-1.5 py-0.5 text-[0.6rem] font-mono transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-[var(--boared-rule)] text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            <GitCommitHorizontal className="h-2.5 w-2.5" />
            <span className="truncate max-w-[80px]">{s.agentName ?? s.agentId.slice(0, 6)}</span>
            <span className="text-muted-foreground/80">·</span>
            <span>{s.operation}</span>
            <span className="text-muted-foreground/80">·</span>
            <span>{timeAgo(s.capturedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
