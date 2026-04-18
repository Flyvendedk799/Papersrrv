/**
 * Workflow artifacts panel (backlog 1.md 3.2).
 *
 * Separate view into the `workflow-artifacts` folder used by agents
 * and workflow runs. Keeps large generated artifacts visible without
 * cluttering the main files tree.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, FileText, ExternalLink } from "lucide-react";
import { Link } from "@/lib/router";
import { filesApi } from "../api/files";
import { useFeatureFlag } from "../lib/featureFlags";
import { buildFilesHref } from "../lib/fileContext";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";

interface Props {
  companyId: string;
}

export function WorkflowArtifactsPanel({ companyId }: Props) {
  const enabled = useFeatureFlag("files_workflow_artifacts");
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ["workflow-artifacts", companyId],
    queryFn: () => filesApi.listWorkflowArtifacts(companyId, 200),
    enabled: enabled && expanded && !!companyId,
    staleTime: 30_000,
  });

  if (!enabled) return null;

  return (
    <section
      aria-labelledby="artifacts-heading"
      className="mb-3 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2"
        aria-expanded={expanded}
      >
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span id="artifacts-heading" className="font-mono uppercase tracking-[0.08em] text-[0.66rem] text-muted-foreground">
          Workflow artifacts
        </span>
        {data && <span className="text-[0.62rem] text-muted-foreground">({data.length})</span>}
      </button>

      {expanded && (
        <div className="border-t border-[var(--boared-rule)]">
          {!data ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : data.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground italic">
              No workflow artifacts yet. Artifacts appear as workflow runs produce files.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--boared-rule)] max-h-72 overflow-auto">
              {data.map((a) => (
                <li key={a.snapshotId} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs")}>
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{a.filePath}</span>
                  <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground shrink-0">
                    {a.agentName ?? a.agentId?.slice(0, 6)} · {timeAgo(a.capturedAt)}
                  </span>
                  <Link
                    to={buildFilesHref({
                      filePath: a.filePath,
                      contentHash: a.contentHash,
                      runId: a.runId,
                      agentId: a.agentId,
                      source: "workflow",
                    })}
                    aria-label={`Open ${a.filePath}`}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
