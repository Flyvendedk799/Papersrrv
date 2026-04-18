/* ─────────────────────────────────────────────────────────────────────
 *  CaseTimeline — the horizontal narrative layer threading through the
 *  thought network.
 *
 *  Composes:
 *    · TimelineSpine — the horizontal tube + endpoint caps
 *    · AgentLane × N — one ribbon per agent with glyphs for their events
 *    · CausalArcs — bezier curves connecting cause → effect
 *    · ChapterMarks — editorial labels along the spine
 *
 *  Reads from SceneStateContext so glyphs share hover + selection with
 *  the orbit layer below-fold rows.
 *
 *  Gated by `filters.timeline` upstream in IssueScene — this component
 *  only mounts when the filter is on.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type { IssueGraph } from "../data/types";
import { layoutTimeline } from "../data/timelineLayout";
import { TimelineSpine } from "./TimelineSpine";
import { AgentLane } from "./AgentLane";
import { CausalArcs } from "./CausalArcs";
import { ChapterMarks } from "./ChapterMarks";

interface CaseTimelineProps {
  graph: IssueGraph;
}

export function CaseTimeline({ graph }: CaseTimelineProps) {
  const layout = useMemo(() => layoutTimeline(graph), [graph]);

  /* Group events by agent once so each AgentLane only iterates over
   * its own items. */
  const eventsByAgent = useMemo(() => {
    const m = new Map<string, typeof layout.events>();
    for (const e of layout.events) {
      const arr = m.get(e.agentId);
      if (arr) arr.push(e);
      else m.set(e.agentId, [e]);
    }
    return m;
  }, [layout.events]);

  return (
    <group>
      <TimelineSpine length={layout.length} />
      <ChapterMarks marks={layout.chapters} />
      {layout.lanes.map((lane) => (
        <AgentLane
          key={lane.agentId}
          lane={lane}
          events={eventsByAgent.get(lane.agentId) ?? []}
        />
      ))}
      <CausalArcs
        links={graph.causalLinks}
        events={layout.events}
        lanes={layout.lanes}
      />
    </group>
  );
}
