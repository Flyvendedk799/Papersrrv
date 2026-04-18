/* ─────────────────────────────────────────────────────────────────────
 *  CausalArcs — bezier curves connecting cause → effect events.
 *
 *  Renders a thin additive-blended arc from the source event's 3D
 *  position to the target event's 3D position, curving gently through
 *  an intermediate control point for an organic shape. Arcs are
 *  capped and sorted by the `weight` field so the ones that matter
 *  most survive when there are more links than budget.
 *
 *  Arcs are SECONDARY to glyphs — they're narrative glue, not
 *  protagonists. Opacity stays low (~0.35), color is tinted by the
 *  source agent so the viewer reads "who caused it" at a glance.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CausalLink, TimelineEventPlacement } from "../data/types";
import type { AgentLaneLayout } from "../data/types";
import { useSceneStateOptional } from "../state/SceneStateContext";

interface CausalArcsProps {
  links: CausalLink[];
  events: TimelineEventPlacement[];
  lanes: AgentLaneLayout[];
  /** Cap applied before render (after ranking by weight). */
  maxArcs?: number;
}

export function CausalArcs({
  links,
  events,
  lanes,
  maxArcs = 20,
}: CausalArcsProps) {
  /* Build id → placement lookup + agentId → lane lookup once. */
  const eventById = useMemo(() => {
    const m = new Map<string, TimelineEventPlacement>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  const laneByAgent = useMemo(() => {
    const m = new Map<string, AgentLaneLayout>();
    for (const l of lanes) m.set(l.agentId, l);
    return m;
  }, [lanes]);

  /* Filter + rank + cap. A link survives only if BOTH endpoints are
   * present in the placements list (the lane-layer may have dropped
   * them due to MAX_GLYPHS_PER_LANE). */
  const renderable = useMemo(() => {
    const viable = links
      .map((l) => {
        const src = eventById.get(l.sourceId);
        const tgt = eventById.get(l.targetId);
        if (!src || !tgt) return null;
        const srcLane = laneByAgent.get(src.agentId);
        const tgtLane = laneByAgent.get(tgt.agentId);
        if (!srcLane || !tgtLane) return null;
        return { link: l, src, tgt, srcLane, tgtLane };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    viable.sort((a, b) => b.link.weight - a.link.weight);
    return viable.slice(0, maxArcs);
  }, [links, eventById, laneByAgent, maxArcs]);

  /* Which arcs touch the currently-selected node? Those get brighter
   * + a traveling bead so the user SEES which chain they just
   * navigated. Works whether the arc's endpoint is a run, comment, or
   * descendant. */
  const sceneState = useSceneStateOptional();
  const selectedId = useMemo(() => {
    const s = sceneState?.selection;
    if (!s) return null;
    if (s.kind === "run") return s.data.runId;
    if (
      s.kind === "comment" ||
      s.kind === "descendant" ||
      s.kind === "event" ||
      s.kind === "ancestor" ||
      s.kind === "approval" ||
      s.kind === "issue"
    )
      return s.data.id;
    return null;
  }, [sceneState?.selection]);

  if (renderable.length === 0) return null;

  return (
    <group>
      {renderable.map(({ link, src, tgt, srcLane, tgtLane }) => {
        const isActive =
          selectedId !== null &&
          (selectedId === link.sourceId || selectedId === link.targetId);
        return (
          <Arc
            key={`${link.sourceId}→${link.targetId}`}
            start={[src.x, srcLane.y, 0]}
            end={[tgt.x, tgtLane.y, 0]}
            color={link.color}
            active={isActive}
          />
        );
      })}
    </group>
  );
}

/* ─── One arc ───────────────────────────────────────────────────── */

const ARC_SEGMENTS = 24;

function Arc({
  start,
  end,
  color,
  active = false,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  /** True when this arc connects to the currently-selected node.
   *  Active arcs brighten + gain a traveling bead showing flow
   *  direction (source → target). */
  active?: boolean;
}) {
  /* Keep a THREE.QuadraticBezierCurve3 ref so the traveling bead can
   * sample it without rebuilding the bezier every frame. */
  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null);
  const beadRef = useRef<THREE.Mesh>(null);

  const positions = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    /* Sag the curve toward the viewer (+Z) so arcs pop forward and
     * don't get lost behind the spine / lanes. Magnitude scales with
     * horizontal distance. */
    const dx = Math.abs(b.x - a.x);
    const sag = Math.min(0.9, 0.25 + dx * 0.12);
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;
    const ctrl = new THREE.Vector3(midX, midY, sag);

    /* Quadratic bezier — cheaper than cubic and fine for narrative arcs. */
    const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
    curveRef.current = curve;
    const pts = curve.getPoints(ARC_SEGMENTS);
    const arr = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      arr[i * 3] = pts[i].x;
      arr[i * 3 + 1] = pts[i].y;
      arr[i * 3 + 2] = pts[i].z;
    }
    return arr;
  }, [start, end]);

  /* Animate the traveling bead along the curve — only when active.
   * Source→target direction so the user sees causality "flowing" the
   * right way. Period: 1.5s per traversal. */
  useFrame((state) => {
    if (!active || !beadRef.current || !curveRef.current) return;
    const t = (state.clock.elapsedTime * 0.66) % 1; // 1.5s per loop
    const p = curveRef.current.getPoint(t);
    beadRef.current.position.copy(p);
    // Fade near the ends so the bead pops in/out cleanly.
    const fade = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
    const mat = beadRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.95 * fade;
  });

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.85 : 0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </line>
      {active && (
        <mesh ref={beadRef}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
