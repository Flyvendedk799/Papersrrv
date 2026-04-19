/* ─────────────────────────────────────────────────────────────────────
 *  SubmatterRow — one child issue in the Sub-matters section.
 *
 *  Renders as a card-shaped tile so the sub-matters section scans
 *  like a mini board: status + identifier, priority, serif title,
 *  assignee, age. Wrapped in a SceneRow so the scene colored dot /
 *  pulse-on-navigate / "↗ 3D" chip continue to work.
 * ───────────────────────────────────────────────────────────────────── */

import { Link } from "react-router-dom";
import type { Issue, Agent } from "@paperclipai/shared";
import { StatusIcon } from "../../../components/StatusIcon";
import { PriorityIcon } from "../../../components/PriorityIcon";
import { Identity } from "../../../components/Identity";
import { SceneRow } from "./SceneRow";
import { useRowIntegration } from "./useRowIntegration";
import type { DescendantNode } from "../../../components/issueScene/data/types";
import { relativeTime } from "../../../lib/utils";

interface SubmatterRowProps {
  child: Issue;
  /** Matching descendant in the scene graph; used for color + target. */
  descendant?: DescendantNode;
  agentMap: Map<string, Agent>;
}

export function SubmatterRow({
  child,
  descendant,
  agentMap,
}: SubmatterRowProps) {
  // If there's no matching descendant in the graph (rare — child issues
  // always correspond to descendant nodes), fall back to a plain card.
  if (!descendant) {
    return <PlainCard child={child} agentMap={agentMap} />;
  }

  const integration = useRowIntegration({
    kind: "descendant",
    data: descendant,
  });

  return (
    <SceneRow integration={integration}>
      <CardBody child={child} agentMap={agentMap} />
    </SceneRow>
  );
}

function PlainCard({ child, agentMap }: { child: Issue; agentMap: Map<string, Agent> }) {
  return (
    <div className="border border-[var(--boared-rule)] bg-[var(--boared-paper)] hover:bg-[var(--boared-paper-2)] transition-colors">
      <CardBody child={child} agentMap={agentMap} />
    </div>
  );
}

function CardBody({ child, agentMap }: { child: Issue; agentMap: Map<string, Agent> }) {
  const assigneeName = child.assigneeAgentId
    ? agentMap.get(child.assigneeAgentId)?.name ?? null
    : null;
  return (
    <Link
      to={`/issues/${child.identifier ?? child.id}`}
      className="flex flex-col gap-2 p-3 text-inherit no-underline h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/25"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon status={child.status} />
        <PriorityIcon priority={child.priority} />
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--boared-ink-faint)] shrink-0 ml-auto">
          {child.identifier ?? child.id.slice(0, 8)}
        </span>
      </div>
      <p className="font-serif italic text-[0.95rem] leading-[1.2] text-[var(--boared-ink)] line-clamp-2 min-h-[2.4em]">
        {child.title}
      </p>
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-[var(--boared-rule)]/40">
        {assigneeName ? (
          <Identity name={assigneeName} size="sm" />
        ) : child.assigneeAgentId ? (
          <span className="font-mono text-[0.6rem] text-[var(--boared-ink-faint)]">
            {child.assigneeAgentId.slice(0, 8)}
          </span>
        ) : (
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            Unassigned
          </span>
        )}
        <span className="ml-auto font-mono text-[0.58rem] tabular-nums text-[var(--boared-ink-faint)]">
          {relativeTime(new Date(child.createdAt).toISOString())}
        </span>
      </div>
    </Link>
  );
}
