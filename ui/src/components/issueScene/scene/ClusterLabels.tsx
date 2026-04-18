/* ─────────────────────────────────────────────────────────────────────
 *  ClusterLabels — named, counted, clickable signposts for each shell
 *  of the Deliberation Sphere.
 *
 *  Clicking a label flies the camera to the corresponding named
 *  CameraPose (RUNS / COMMENTS / APPROVALS / ANCESTORS /
 *  DESCENDANTS), and also dispatches a "jump to this cluster" so the
 *  rest of the scene (Ledger, highlightIds) can respond.
 *
 *  Labels hover slightly up on hover and brighten, so they read as
 *  interactive without being busy.
 * ───────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { Text } from "@react-three/drei";
import { SCENE } from "../colors";
import { LAYOUT } from "../data/layout";
import type { IssueGraph } from "../data/types";
import type { CameraPoseKey } from "./cinematography";

interface ClusterLabelsProps {
  graph: IssueGraph;
  /** Fired when the user clicks one of the cluster signposts. The
   *  parent flies the camera to the matching pose. */
  onJumpToCluster?: (pose: CameraPoseKey) => void;
}

interface LabelSpec {
  key: string;
  text: string;
  position: [number, number, number];
  anchorY: "top" | "middle" | "bottom";
  fontSize: number;
  opacity: number;
  pose: CameraPoseKey;
  count: number;
}

export function ClusterLabels({ graph, onJumpToCluster }: ClusterLabelsProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const specs: LabelSpec[] = [];
  if (graph.runs.length > 0) {
    specs.push({
      key: "runs",
      text: `RUNS · ${graph.runs.length}`,
      position: [0, LAYOUT.RUN_RADIUS + 0.45, 0],
      anchorY: "bottom",
      fontSize: 0.3,
      opacity: 0.55,
      pose: "RUNS",
      count: graph.runs.length,
    });
  }
  if (graph.comments.length > 0) {
    specs.push({
      key: "comments",
      text: `CORRESPONDENCE · ${graph.comments.length}`,
      position: [0, LAYOUT.COMMENT_RADIUS + 0.5, 0],
      anchorY: "bottom",
      fontSize: 0.3,
      opacity: 0.55,
      pose: "COMMENTS",
      count: graph.comments.length,
    });
  }
  if (graph.events.length > 0) {
    specs.push({
      key: "events",
      text: `ACTIVITY · ${graph.events.length}`,
      position: [0, LAYOUT.EVENT_RADIUS + 0.55, 0],
      anchorY: "bottom",
      fontSize: 0.26,
      opacity: 0.46,
      pose: "COMMENTS",
      count: graph.events.length,
    });
  }
  if (graph.approvals.length > 0) {
    specs.push({
      key: "approvals",
      text: `APPROVALS · ${graph.approvals.length}`,
      position: [0, LAYOUT.APPROVAL_Y + 1.1, 0],
      anchorY: "bottom",
      fontSize: 0.3,
      opacity: 0.55,
      pose: "APPROVALS",
      count: graph.approvals.length,
    });
  }
  if (graph.ancestors.length > 0) {
    specs.push({
      key: "ancestors",
      text: `PARENTS · ${graph.ancestors.length}`,
      position: [
        0,
        (graph.ancestors.length + 1) * LAYOUT.ANCESTOR_STEP + 0.6,
        0,
      ],
      anchorY: "bottom",
      fontSize: 0.28,
      opacity: 0.46,
      pose: "ANCESTORS",
      count: graph.ancestors.length,
    });
  }
  if (graph.descendants.length > 0) {
    specs.push({
      key: "descendants",
      text: `SUB-MATTERS · ${graph.descendants.length}`,
      position: [0, -LAYOUT.DESCENDANT_STEP - 1.6, 0],
      anchorY: "top",
      fontSize: 0.28,
      opacity: 0.46,
      pose: "DESCENDANTS",
      count: graph.descendants.length,
    });
  }

  return (
    <group>
      {specs.map((spec) => {
        const isHovered = hovered === spec.key;
        const lift = isHovered ? 0.2 : 0;
        const opacity = isHovered ? 0.95 : spec.opacity;
        const pos: [number, number, number] = [
          spec.position[0],
          spec.position[1] + (spec.anchorY === "top" ? -lift : lift),
          spec.position[2],
        ];
        return (
          <Text
            key={spec.key}
            position={pos}
            color={SCENE.cream}
            fontSize={spec.fontSize}
            anchorX="center"
            anchorY={spec.anchorY}
            fillOpacity={opacity}
            letterSpacing={0.22}
            outlineColor="#000"
            outlineOpacity={0.65}
            outlineWidth={0.006}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(spec.key);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = "";
            }}
            onClick={(e) => {
              e.stopPropagation();
              onJumpToCluster?.(spec.pose);
            }}
          >
            {spec.text}
          </Text>
        );
      })}
    </group>
  );
}
