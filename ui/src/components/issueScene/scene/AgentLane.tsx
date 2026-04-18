/* ─────────────────────────────────────────────────────────────────────
 *  AgentLane — one horizontal ribbon for a single agent, with its events
 *  pinned along the spine.
 *
 *  The lane is a thin additive line from xStart → xEnd at lane.y. Each
 *  event on that agent renders as a small glyph at (event.x, lane.y, 0)
 *  — different geometry per kind (disc / orb / diamond / fork / fleck).
 *
 *  Every glyph participates in the unified interaction bridge:
 *    · click   → actions.selectAndFocus(target) → Companion Inspector
 *    · hover   → scene hover halo + below-fold row halo (same store)
 *
 *  Visual language matches the orbit layer so the viewer sees
 *  "same dot in two different arrangements" — a run disc on a lane is
 *  visibly the same thing as a run disc in the orbit.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import type {
  AgentLaneLayout,
  TimelineEventPlacement,
  RunNode,
} from "../data/types";
import { SCENE } from "../colors";
import {
  useSceneActions,
  useSetHover,
  targetToRef,
} from "../state/SceneStateContext";

interface AgentLaneProps {
  lane: AgentLaneLayout;
  events: TimelineEventPlacement[];
}

export function AgentLane({ lane, events }: AgentLaneProps) {
  const laneMatRef = useRef<THREE.MeshBasicMaterial>(null);

  /* Lane breathing — very subtle pulse only on live lanes.
   * We determine "live" by checking whether any run event on this lane
   * is a live run. (Cheap at this scale.) */
  const hasLive = useMemo(
    () =>
      events.some(
        (e) => e.kind === "run" && (e.target.data as RunNode).isLive,
      ),
    [events],
  );

  useFrame((state) => {
    if (!laneMatRef.current) return;
    const t = state.clock.elapsedTime;
    const base = 0.22;
    const boost = hasLive ? 0.12 * (0.5 + 0.5 * Math.sin(t * 2.4)) : 0;
    laneMatRef.current.opacity = base + boost;
  });

  const laneLength = Math.max(0.001, lane.xEnd - lane.xStart);

  return (
    <group>
      {/* The lane ribbon — a very thin cylinder laid along X. */}
      <mesh
        position={[(lane.xStart + lane.xEnd) / 2, lane.y, 0]}
        rotation={[0, 0, Math.PI / 2]}
        frustumCulled={false}
      >
        <cylinderGeometry
          args={[0.008, 0.008, laneLength, 6, 1, true]}
        />
        <meshBasicMaterial
          ref={laneMatRef}
          color={lane.color}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Agent label at the lane's past end. Fragment Mono-ish via drei Text. */}
      {lane.xStart > -14 + 0.5 && (
        <Text
          position={[lane.xStart - 0.18, lane.y, 0]}
          fontSize={0.14}
          color={SCENE.creamDim}
          anchorX="right"
          anchorY="middle"
          letterSpacing={0.2}
          outlineColor="#000"
          outlineWidth={0.01}
        >
          {lane.agentName.toUpperCase()}
        </Text>
      )}

      {/* Glyphs */}
      {events.map((e) => (
        <EventGlyph key={e.id} placement={e} lane={lane} />
      ))}
    </group>
  );
}

/* ─── Glyphs ────────────────────────────────────────────────────── */

interface EventGlyphProps {
  placement: TimelineEventPlacement;
  lane: AgentLaneLayout;
}

function EventGlyph({ placement, lane }: EventGlyphProps) {
  const actions = useSceneActions();
  const setHover = useSetHover();
  const groupRef = useRef<THREE.Group>(null);

  const ref = targetToRef(placement.target);
  const color = lane.color;

  /* Live-run pulse — mirrors RunOrbit's behaviour for consistency. */
  const isLiveRun =
    placement.kind === "run" && (placement.target.data as RunNode).isLive;
  useFrame((state) => {
    if (!isLiveRun || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * 3.4 + placement.x) * 0.1;
    groupRef.current.scale.setScalar(s);
  });

  const onPointerOver = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setHover(ref);
    document.body.style.cursor = "pointer";
  };
  const onPointerOut = () => {
    setHover(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    actions.selectAndFocus(placement.target);
  };

  const commonProps = {
    onPointerOver,
    onPointerOut,
    onClick,
  };

  switch (placement.kind) {
    case "run": {
      const run = placement.target.data as RunNode;
      const r = 0.06 + run.sizeRatio * 0.07;
      return (
        <group ref={groupRef} position={[placement.x, lane.y, 0]}>
          {/* Outer glow disc */}
          <mesh {...commonProps}>
            <sphereGeometry args={[r, 12, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* Solid inner core so the dot reads as discrete under bloom */}
          <mesh>
            <sphereGeometry args={[r * 0.55, 10, 10]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        </group>
      );
    }

    case "comment":
      return (
        <group position={[placement.x, lane.y, 0]}>
          <mesh {...commonProps}>
            <sphereGeometry args={[0.055, 10, 10]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.85}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      );

    case "event":
      return (
        <mesh position={[placement.x, lane.y, 0]} {...commonProps}>
          <sphereGeometry args={[0.032, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      );

    case "approval-requested":
    case "approval-decided": {
      const outlineOnly = placement.kind === "approval-requested";
      return (
        <mesh
          position={[placement.x, lane.y, 0]}
          rotation={[0, 0, Math.PI / 4]}
          {...commonProps}
        >
          <boxGeometry args={[0.08, 0.08, 0.02]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={outlineOnly ? 0.5 : 0.95}
            wireframe={outlineOnly}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      );
    }

    case "spawn":
      return (
        <group position={[placement.x, lane.y, 0]}>
          {/* Tiny fork glyph — a downward V */}
          <mesh {...commonProps}>
            <coneGeometry args={[0.05, 0.1, 3]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.75}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      );
  }
}
