/* ─────────────────────────────────────────────────────────────────────
 *  FirstClickHint — a gentle "tap here to begin" pulse on the most
 *  interesting node when nothing is selected.
 *
 *  Discoverability bet: users don't know the orbs are clickable until
 *  they click one. A single soft acid ring pulsing at the best starter
 *  node tells them "this is a clickable journey" without adding label
 *  clutter. Disappears the moment they interact.
 *
 *  Priority of "best starter" node (highest first):
 *    1. A live run (most recent)
 *    2. A pending approval
 *    3. The most recent comment
 *    4. The most recent run
 *    5. Nothing  — component renders null
 *
 *  Positioning reuses anchorForTarget semantics inline so we don't have
 *  to couple with IssueScene.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { IssueGraph, SceneTarget } from "../data/types";
import { useSceneStateOptional } from "../state/SceneStateContext";
import { SCENE } from "../colors";

interface FirstClickHintProps {
  graph: IssueGraph;
}

export function FirstClickHint({ graph }: FirstClickHintProps) {
  const state = useSceneStateOptional();
  const [dismissed, setDismissed] = useState(false);

  /* Self-dismiss when the user selects ANYTHING OR navigates the
   * journey. Once dismissed, never comes back this session. */
  useEffect(() => {
    if (state?.selection) setDismissed(true);
    if (state && state.journey.length > 0) setDismissed(true);
  }, [state?.selection, state?.journey.length]);

  /* Auto-dismiss after 14s if user hasn't interacted — we don't want
   * a pulsing ring for eternity. */
  useEffect(() => {
    const h = window.setTimeout(() => setDismissed(true), 14000);
    return () => window.clearTimeout(h);
  }, []);

  const pick = useMemo(() => pickStarterTarget(graph), [graph]);

  if (dismissed || !pick) return null;
  return <Ring anchor={pick.anchor} color={pick.color} />;
}

function Ring({
  anchor,
  color,
}: {
  anchor: [number, number, number];
  color: string;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    /* Inner ring — soft breath. */
    if (ringRef.current) {
      const s = 1 + Math.sin(t * 1.4) * 0.12;
      ringRef.current.scale.setScalar(s);
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.6 + Math.sin(t * 1.4) * 0.2;
    }
    /* Outer ring — 2s expansion cycle, fade out as it grows. */
    if (outerRef.current) {
      const phase = (t * 0.5) % 1; // 2s
      const scale = 1 + phase * 3.5;
      outerRef.current.scale.setScalar(scale);
      const m = outerRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 * (1 - phase);
    }
    /* Label bob. */
    if (labelRef.current) {
      labelRef.current.position.y = anchor[1] + 0.9 + Math.sin(t * 1.2) * 0.05;
    }
  });

  return (
    <group>
      <group position={anchor}>
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.018, 12, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={outerRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.012, 10, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={labelRef} position={[anchor[0], anchor[1] + 0.9, anchor[2]]}>
        <Text
          fontSize={0.16}
          color={color}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.3}
          outlineColor="#000"
          outlineWidth={0.012}
        >
          TAP TO BEGIN
        </Text>
      </group>
    </group>
  );
}

/* ─── picker ───────────────────────────────────────────────────── */

interface StarterPick {
  anchor: [number, number, number];
  color: string;
  target: SceneTarget;
}

function pickStarterTarget(graph: IssueGraph): StarterPick | null {
  /* 1. Live run (most recent). */
  const liveRuns = graph.runs.filter((r) => r.isLive);
  if (liveRuns.length > 0) {
    const r = liveRuns.reduce((best, x) =>
      x.startedAt > best.startedAt ? x : best,
    );
    return {
      anchor: [
        Math.cos(r.orbitAngle) * 5.5,
        0.9,
        Math.sin(r.orbitAngle) * 5.5,
      ],
      color: SCENE.acid,
      target: { kind: "run", data: r },
    };
  }

  /* 2. Pending approval (portal ring). */
  const pending = graph.approvals.filter((a) => a.status === "pending");
  if (pending.length > 0) {
    const a = pending[0];
    return {
      anchor: [Math.cos(a.angle) * 2.5, 4.4, Math.sin(a.angle) * 2.5],
      color: "#FBBF24",
      target: { kind: "approval", data: a },
    };
  }

  /* 3. Most recent comment. */
  if (graph.comments.length > 0) {
    const c = graph.comments.reduce((best, x) =>
      x.createdAt > best.createdAt ? x : best,
    );
    return {
      anchor: [
        Math.cos(c.orbitAngle) * 7.2,
        1.5,
        Math.sin(c.orbitAngle) * 7.2,
      ],
      color: SCENE.acid,
      target: { kind: "comment", data: c },
    };
  }

  /* 4. Most recent run. */
  if (graph.runs.length > 0) {
    const r = graph.runs.reduce((best, x) =>
      x.startedAt > best.startedAt ? x : best,
    );
    return {
      anchor: [
        Math.cos(r.orbitAngle) * 5.5,
        0.9,
        Math.sin(r.orbitAngle) * 5.5,
      ],
      color: SCENE.acid,
      target: { kind: "run", data: r },
    };
  }

  return null;
}
