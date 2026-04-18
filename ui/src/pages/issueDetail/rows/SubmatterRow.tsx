/* ─────────────────────────────────────────────────────────────────────
 *  SubmatterRow — one child issue in the Sub-matters section.
 *
 *  Wraps the existing <Link> design inside a SceneRow so it gets the
 *  colored dot, hover halo, pulse-on-navigate animation, and the
 *  trailing "↗ 3D" chip that flies the camera to this sub-matter's orb
 *  in the thought network.
 * ───────────────────────────────────────────────────────────────────── */

import { Link } from "react-router-dom";
import type { Issue, Agent } from "@paperclipai/shared";
import { StatusIcon } from "../../../components/StatusIcon";
import { PriorityIcon } from "../../../components/PriorityIcon";
import { Identity } from "../../../components/Identity";
import { SceneRow } from "./SceneRow";
import { useRowIntegration } from "./useRowIntegration";
import type { DescendantNode } from "../../../components/issueScene/data/types";

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
  // always correspond to descendant nodes), fall back to a plain row.
  if (!descendant) {
    return <PlainRow child={child} agentMap={agentMap} />;
  }

  const integration = useRowIntegration({
    kind: "descendant",
    data: descendant,
  });

  return (
    <SceneRow integration={integration}>
      <Link
        to={`/issues/${child.identifier ?? child.id}`}
        className="flex items-center justify-between text-[0.82rem] no-underline text-inherit w-full"
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={child.status} />
          <PriorityIcon priority={child.priority} />
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground shrink-0">
            {child.identifier ?? child.id.slice(0, 8)}
          </span>
          <span className="truncate">{child.title}</span>
        </div>
        {child.assigneeAgentId &&
          (() => {
            const name = agentMap.get(child.assigneeAgentId)?.name;
            return name ? (
              <Identity name={name} size="sm" />
            ) : (
              <span className="font-mono text-[0.66rem] text-muted-foreground">
                {child.assigneeAgentId.slice(0, 8)}
              </span>
            );
          })()}
      </Link>
    </SceneRow>
  );
}

function PlainRow({
  child,
  agentMap,
}: {
  child: Issue;
  agentMap: Map<string, Agent>;
}) {
  return (
    <Link
      to={`/issues/${child.identifier ?? child.id}`}
      className="flex items-center justify-between px-1 py-2.5 text-[0.82rem] hover:bg-foreground/[0.03] transition-colors no-underline text-inherit"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon status={child.status} />
        <PriorityIcon priority={child.priority} />
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground shrink-0">
          {child.identifier ?? child.id.slice(0, 8)}
        </span>
        <span className="truncate">{child.title}</span>
      </div>
      {child.assigneeAgentId &&
        (() => {
          const name = agentMap.get(child.assigneeAgentId)?.name;
          return name ? (
            <Identity name={name} size="sm" />
          ) : (
            <span className="font-mono text-[0.66rem] text-muted-foreground">
              {child.assigneeAgentId.slice(0, 8)}
            </span>
          );
        })()}
    </Link>
  );
}
