/**
 * CaseFile — the hero of /issues/:id.
 *
 * Four stacked surfaces, in reading order:
 *
 *   1. HEADER  ─ identifier + title + plain-English abstract + status
 *   2. OUTCOME ─ what was made (artifacts, tiled)
 *   3. FLOW    ─ how it got here (fan-out/fan-in case graph)
 *   4. THREAD  ─ the conversation, with composer, visible by default
 *
 * Visual hierarchy: each surface has its own kicker + a thicker
 * rule separating it from the next. The abstract is the largest
 * body type on the page — it's the one thing a non-technical
 * reader is supposed to read in 10 seconds.
 *
 * Reads a single `CaseSynthesisPayload` from /issues/:id/synthesis.
 * On LLM-enabled servers the abstract + artifact detail fields
 * are rewritten by Claude; on template-only, it's heuristic.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";
import { issuesApi, type CaseSynthesisPayload } from "../../../api/issues";
import { cn, relativeTime } from "../../../lib/utils";
import { queryKeys } from "../../../lib/queryKeys";
import { CaseSummary } from "../CaseSummary";
import { CaseGraph } from "./CaseGraph";
import { CaseArtifacts } from "./CaseArtifacts";
import { CaseComposer } from "./CaseComposer";
import { StatusIcon } from "../../StatusIcon";
import { PriorityIcon } from "../../PriorityIcon";

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  className?: string;
}

export function CaseFile({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const synthesisQuery = useQuery({
    queryKey: queryKeys.issues.synthesis(issue.id),
    queryFn: () => issuesApi.synthesis(issue.id),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const synthesis = synthesisQuery.data ?? null;

  /* Graph click → thread card. Graph nodes dispatch a custom event
   * with the matching card id; the thread drawer scrolls it in. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id) return;
      setSelectedId(detail.id);
    };
    window.addEventListener("paperclip:case-graph-select", handler);
    return () => window.removeEventListener("paperclip:case-graph-select", handler);
  }, []);

  return (
    <article
      className={cn(
        "relative border border-[var(--boared-rule)] bg-[var(--boared-paper)] text-[var(--boared-ink)] overflow-hidden",
        className,
      )}
    >
      <CaseFileHeader
        issue={issue}
        synthesis={synthesis}
        loading={synthesisQuery.isLoading}
      />

      <SurfaceDivider label="What was made" meta={artifactMeta(synthesis)} />
      <CaseArtifacts
        artifacts={synthesis?.artifacts ?? []}
        loading={synthesisQuery.isLoading}
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issue.id) })
        }
      />

      <SurfaceDivider label="How it got here" meta={graphMeta(synthesis)} />
      <CaseGraph
        graph={synthesis?.graph ?? { nodes: [], edges: [] }}
        loading={synthesisQuery.isLoading}
      />

      <SurfaceDivider label="The conversation" meta="visible when you need the detail" />
      <CaseSummary
        issue={issue}
        comments={comments}
        activity={activity}
        childIssues={childIssues}
        linkedRuns={linkedRuns}
        agentMap={agentMap}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        className="max-h-[60vh]"
      />
      <CaseComposer issueId={issue.id} />
    </article>
  );
}

/* ─────────────────────── Subcomponents ─────────────────────── */

function CaseFileHeader({
  issue,
  synthesis,
  loading,
}: {
  issue: Issue;
  synthesis: CaseSynthesisPayload | null;
  loading: boolean;
}) {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  const ageLabel = ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays}d old`;
  return (
    <header className="px-6 pt-6 pb-5 border-b border-[var(--boared-rule)] space-y-4">
      {/* Kicker — the smallest type on the page; dense meta */}
      <div className="flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        <span>§ {issue.identifier ?? "case"}</span>
        <span aria-hidden="true">·</span>
        <span>opened {ageLabel}</span>
        <span aria-hidden="true">·</span>
        <span>updated {relativeTime(issue.updatedAt)}</span>
      </div>
      {/* Title — the biggest type on the page; serif italic */}
      <h1 className="font-serif italic text-[clamp(1.8rem,3.8vw,2.6rem)] leading-[1.02] text-[var(--boared-ink)] tracking-tight">
        {issue.title}
      </h1>
      {/* Abstract — the thing you came here to read. Second-largest
          body type so it reads as the answer, not a subtitle. */}
      <div className="min-h-[3.2rem]">
        {loading && !synthesis ? (
          <div className="space-y-1.5">
            <div className="h-4 w-3/4 bg-[var(--boared-rule)]/40 animate-pulse" />
            <div className="h-4 w-1/2 bg-[var(--boared-rule)]/30 animate-pulse" />
          </div>
        ) : synthesis ? (
          <p className="text-[1.1rem] leading-[1.45] text-[var(--boared-ink)]">
            {synthesis.abstract}
          </p>
        ) : (
          <p className="text-[0.9rem] italic text-[var(--boared-ink-faint)]">
            Couldn't load the summary — the conversation below has the full picture.
          </p>
        )}
      </div>
      {/* Status rail — below the abstract, not above the title, so
          it reads as "how things stand" after you know what the
          case is. Includes the generator badge on LLM mode so you
          can distinguish AI-authored abstracts from heuristic. */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <StatusIcon status={issue.status} showLabel />
        <PriorityIcon priority={issue.priority} showLabel />
        {synthesis?.generator === "llm" && (
          <span className="ml-auto inline-flex items-center gap-1 px-1.5 h-5 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] border border-[var(--boared-rule)]">
            AI summary
          </span>
        )}
      </div>
    </header>
  );
}

/** Small kicker-style divider between the CaseFile's major surfaces.
 * Reads as a section heading; the body of each surface renders
 * immediately below. Kept visually similar to the header kicker so
 * the eye groups everything inside the CaseFile card together. */
function SurfaceDivider({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-6 pt-5 pb-2 border-t border-[var(--boared-rule)] bg-[var(--boared-paper-2)]/40">
      <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[var(--boared-ink)]">
        {label}
      </h2>
      {meta && (
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] tabular-nums">
          {meta}
        </span>
      )}
    </div>
  );
}

function artifactMeta(s: CaseSynthesisPayload | null): string | undefined {
  if (!s) return undefined;
  const n = s.artifacts.length;
  if (n === 0) return "nothing yet";
  return n === 1 ? "1 artifact" : `${n} artifacts`;
}

function graphMeta(s: CaseSynthesisPayload | null): string | undefined {
  if (!s) return undefined;
  const n = s.graph.nodes.length;
  if (n === 0) return "no work yet";
  return n === 1 ? "1 step" : `${n} steps`;
}
