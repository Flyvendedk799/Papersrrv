/* ─────────────────────────────────────────────────────────────────────
 *  ActivityRow — one activity event in the Activity log section.
 *
 *  Wraps the existing activity line in a SceneRow. Events in the scene
 *  are orbs on the comment ring (they share the ring because they're
 *  both time-ordered "conversation"). The dot color is the actor's
 *  agent color.
 * ───────────────────────────────────────────────────────────────────── */

import type { ActivityEvent, Agent } from "@paperclipai/shared";
import type { ReactNode } from "react";
import { relativeTime } from "../../../lib/utils";
import { SceneRow } from "./SceneRow";
import { useRowIntegration } from "./useRowIntegration";
import type { EventNode } from "../../../components/issueScene/data/types";

interface ActivityRowProps {
  event: ActivityEvent;
  /** Matching event node in the scene graph. */
  eventNode?: EventNode;
  actorLabel: ReactNode;
  verbLabel: string;
  agentMap: Map<string, Agent>;
}

export function ActivityRow({
  event,
  eventNode,
  actorLabel,
  verbLabel,
}: ActivityRowProps) {
  if (!eventNode) {
    // Event exists in activity list but didn't make it into the scene
    // graph (e.g., capped by EVENT_LIMIT). Render unadorned.
    return (
      <div className="flex items-center gap-2 py-2 px-1 text-[0.78rem] text-muted-foreground">
        {actorLabel}
        <span>{verbLabel}</span>
        <span className="ml-auto shrink-0 font-mono text-[0.62rem] tabular-nums">
          {relativeTime(event.createdAt)}
        </span>
      </div>
    );
  }

  const integration = useRowIntegration({ kind: "event", data: eventNode });

  return (
    <SceneRow integration={integration}>
      <div className="flex items-center gap-2 text-[0.78rem] text-muted-foreground min-w-0">
        {actorLabel}
        <span className="truncate">{verbLabel}</span>
        <span className="ml-auto shrink-0 font-mono text-[0.62rem] tabular-nums">
          {relativeTime(event.createdAt)}
        </span>
      </div>
    </SceneRow>
  );
}
