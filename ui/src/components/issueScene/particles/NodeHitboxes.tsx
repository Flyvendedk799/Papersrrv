/**
 * NodeHitboxes — invisible raycast targets at each graph node centroid.
 *
 * Once the discrete orbit meshes are removed (Milestone 7), the particle
 * cloud can't be raycasted (additive + depthWrite:false + thousands of
 * sprites). This component provides a small, invisible InstancedMesh of
 * bounding spheres at node centroids that the existing hover/selection
 * machinery can hit-test against.
 *
 * Integrates with SceneStateContext just like the old orbit meshes did —
 * on pointer enter/leave/click we dispatch `setHover` / `selectAndFocus`
 * with the correct SceneTarget so the DOM rows still light up and the
 * camera choreographer still flies to the right pose.
 *
 * Usage (M7): <NodeHitboxes graph={graph} />
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

import type {
  AncestorNode,
  ApprovalNode,
  CommentNode,
  DescendantNode,
  EventNode,
  IssueGraph,
  RunNode,
  SceneTarget,
  Vec3,
} from "../data/types";

interface NodeHitboxesProps {
  graph: IssueGraph;
  onHover?: (target: SceneTarget | null) => void;
  onSelect?: (target: SceneTarget) => void;
  /** Radius of each hitbox sphere — should match the visible cluster size. */
  radius?: number;
}

interface HitboxEntry {
  pos: Vec3;
  target: SceneTarget;
}

export function NodeHitboxes({
  graph,
  onHover,
  onSelect,
  radius = 0.9,
}: NodeHitboxesProps) {
  const entries = useMemo(() => flattenTargets(graph), [graph]);
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Populate instance matrices from entry positions.
  useMemo(() => {
    if (!meshRef.current) return;
    const m = new THREE.Matrix4();
    entries.forEach((e, i) => {
      m.makeTranslation(e.pos[0], e.pos[1], e.pos[2]);
      meshRef.current!.setMatrixAt(i, m);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [entries]);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    const i = e.instanceId;
    if (i == null || i >= entries.length) return;
    e.stopPropagation();
    onHover?.(entries[i].target);
  };
  const handlePointerOut = () => onHover?.(null);
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const i = e.instanceId;
    if (i == null || i >= entries.length) return;
    e.stopPropagation();
    onSelect?.(entries[i].target);
  };

  if (entries.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, entries.length]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <sphereGeometry args={[radius, 8, 6]} />
      {/* Fully invisible — only raycast matters. depthTest true so
          hitboxes respect each other's ordering when overlapping. */}
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function flattenTargets(graph: IssueGraph): HitboxEntry[] {
  const out: HitboxEntry[] = [];
  // Root issue at origin.
  out.push({ pos: [0, 0, 0], target: { kind: "issue", data: graph.root } });

  for (const a of graph.ancestors as AncestorNode[]) {
    if (!a.spherePos) continue;
    out.push({ pos: a.spherePos, target: { kind: "ancestor", data: a } });
  }
  for (const d of graph.descendants as DescendantNode[]) {
    if (!d.spherePos) continue;
    out.push({ pos: d.spherePos, target: { kind: "descendant", data: d } });
  }
  for (const r of graph.runs as RunNode[]) {
    if (!r.spherePos) continue;
    out.push({ pos: r.spherePos, target: { kind: "run", data: r } });
  }
  for (const c of graph.comments as CommentNode[]) {
    if (!c.spherePos) continue;
    out.push({ pos: c.spherePos, target: { kind: "comment", data: c } });
  }
  for (const e of graph.events as EventNode[]) {
    if (!e.spherePos) continue;
    out.push({ pos: e.spherePos, target: { kind: "event", data: e } });
  }
  for (const a of graph.approvals as ApprovalNode[]) {
    if (!a.spherePos) continue;
    out.push({ pos: a.spherePos, target: { kind: "approval", data: a } });
  }
  return out;
}
