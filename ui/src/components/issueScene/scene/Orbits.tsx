/* ─────────────────────────────────────────────────────────────────────
 *  Orbits — the layers around the IssuePillar
 *
 *  All the orbiting / stacked elements live here as separate components
 *  that share a common pattern: read from the IssueGraph, render
 *  deterministic positions, fire hover/click callbacks to the scene's
 *  selection system.
 *
 *  Layers exported:
 *    · RunOrbit        — agent-colored discs circling the pillar
 *    · CommentOrbit    — orbs for comments + activity events
 *    · AncestorChain   — concentric rings stacking upward
 *    · DescendantRoots — smaller pillars fanning downward
 *    · ApprovalPortals — floating rings above the pillar tip
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Line, Instances, Instance } from "@react-three/drei";
import * as THREE from "three";
import { SCENE, statusColor } from "../colors";
import type {
  AncestorNode,
  ApprovalNode,
  CommentNode,
  DescendantNode,
  EventNode,
  RunNode,
  SceneTarget,
} from "../data/types";

type HoverHandler = (target: SceneTarget | null) => void;
type SelectHandler = (target: SceneTarget) => void;

const RUN_ORBIT_RADIUS = 5.5;
const RUN_ORBIT_TILT_X = 0.38;   // pitched forward
const RUN_ORBIT_TILT_Z = 0.14;   // + slight roll
const COMMENT_ORBIT_RADIUS = 7.2;
// Comment ring nearly orthogonal to the run ring — tilted the other way
// and rolled hard so the two rings visibly cross.
const COMMENT_ORBIT_TILT_X = -0.25;
const COMMENT_ORBIT_TILT_Z = -0.75;
const ANCESTOR_STEP = 2.4;
const ANCESTOR_HELIX_RADIUS = 0.7;
const DESCENDANT_STEP = 2.2;
const DESCENDANT_FAN_RADIUS = 4.6;
const APPROVAL_RING_RADIUS = 2.5;
const APPROVAL_RING_Y = 3.8;

/* Stable deterministic hash → float in [0, 1) for per-element variation. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Build a subtly curved spoke from the origin to a given end point.
 *  The midpoint is displaced perpendicular to the spoke axis by a
 *  deterministic hash-driven amount, yielding a gentle arc that reads
 *  far more organic than a straight line. */
function curvedSpokePoints(
  end: [number, number, number],
  seed: string,
  bowAmount = 0.55,
  segments = 16,
): Array<[number, number, number]> {
  const [ex, ey, ez] = end;
  const len = Math.hypot(ex, ey, ez);
  if (len < 0.001) return [[0, 0, 0], end];
  // Perpendicular direction: cross with Y up, normalize; if colinear, pick X up.
  const ax = ex / len, ay = ey / len, az = ez / len;
  let px = -az, py = 0, pz = ax;
  const pmag = Math.hypot(px, py, pz);
  if (pmag < 0.01) { px = 0; py = 1; pz = 0; }
  else { px /= pmag; pz /= pmag; }
  // Pick a bow magnitude + a secondary perpendicular axis for Y kick.
  const h1 = hash01(`bow:${seed}`) - 0.5;
  const h2 = hash01(`bowY:${seed}`) - 0.5;
  const bow = bowAmount * (0.6 + Math.abs(h1) * 0.9);
  const midX = ex * 0.5 + px * bow * Math.sign(h1 || 1);
  const midY = ey * 0.5 + bow * 0.7 * h2;
  const midZ = ez * 0.5 + pz * bow * Math.sign(h1 || 1);
  // Quadratic Bezier sample
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const omt = 1 - t;
    const bx = omt * omt * 0 + 2 * omt * t * midX + t * t * ex;
    const by = omt * omt * 0 + 2 * omt * t * midY + t * t * ey;
    const bz = omt * omt * 0 + 2 * omt * t * midZ + t * t * ez;
    out.push([bx, by, bz]);
  }
  return out;
}

/* ─── Run orbit ────────────────────────────────────────────────── */

export function RunOrbit({
  runs,
  onHover,
  onSelect,
}: {
  runs: RunNode[];
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) groupRef.current.rotation.y = t * 0.05;
  });

  if (runs.length === 0) return null;

  return (
    <group ref={groupRef} rotation={[RUN_ORBIT_TILT, 0, 0]}>
      {/* Faint orbit guide ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RUN_ORBIT_RADIUS - 0.01, RUN_ORBIT_RADIUS + 0.01, 96]} />
        <meshBasicMaterial
          color={SCENE.creamDim}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* All run discs in one instanced mesh. Single draw call, no
       *  per-run lights, no per-run lines — the pillar's own point
       *  light + the bloom pass give us the glow we need. */}
      <Instances limit={80} frustumCulled={false}>
        <cylinderGeometry args={[0.6, 0.6, 0.14, 24]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.2}
          toneMapped={false}
        />
        {runs.map((r) => (
          <RunInstance key={r.runId} run={r} onHover={onHover} onSelect={onSelect} />
        ))}
      </Instances>
    </group>
  );
}

function RunInstance({
  run,
  onHover,
  onSelect,
}: {
  run: RunNode;
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const x = Math.cos(run.orbitAngle) * RUN_ORBIT_RADIUS;
  const z = Math.sin(run.orbitAngle) * RUN_ORBIT_RADIUS;
  const scale = 0.55 + run.sizeRatio * 0.85;
  const instanceRef = useRef<THREE.Object3D>(null);

  useFrame((state) => {
    if (!instanceRef.current) return;
    if (run.isLive) {
      const t = state.clock.elapsedTime;
      const pulse = scale * (1 + Math.sin(t * 4.5 + run.orbitAngle * 4) * 0.22);
      instanceRef.current.scale.setScalar(pulse);
    } else {
      instanceRef.current.scale.setScalar(scale);
    }
  });

  return (
    <Instance
      ref={instanceRef as unknown as React.Ref<unknown>}
      position={[x, 0, z]}
      color={run.color}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: "run", data: run });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "run", data: run });
      }}
    />
  );
}

/* ─── Comment + event orbit ────────────────────────────────────── */

export function CommentOrbit({
  comments,
  events,
  onHover,
  onSelect,
}: {
  comments: CommentNode[];
  events: EventNode[];
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) groupRef.current.rotation.y = -t * 0.03;
  });

  if (comments.length === 0 && events.length === 0) return null;

  return (
    <group
      ref={groupRef}
      rotation={[COMMENT_ORBIT_TILT, 0, 0]}
      position={[0, 0.8, 0]}
    >
      {/* Guide ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[COMMENT_ORBIT_RADIUS - 0.008, COMMENT_ORBIT_RADIUS + 0.008, 96]}
        />
        <meshBasicMaterial
          color={SCENE.creamDim}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* All comments share one instanced mesh + one material. Single
       *  draw call regardless of count. */}
      {comments.length > 0 && (
        <Instances limit={200} frustumCulled={false}>
          <icosahedronGeometry args={[0.22, 1]} />
          <meshStandardMaterial
            vertexColors={false}
            roughness={0.35}
            metalness={0.15}
            toneMapped={false}
          />
          {comments.map((c) => (
            <CommentInstance
              key={c.id}
              comment={c}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </Instances>
      )}

      {/* Activity events share another instanced mesh. */}
      {events.length > 0 && (
        <Instances limit={200} frustumCulled={false}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
          {events.map((e) => (
            <EventInstance
              key={e.id}
              event={e}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </Instances>
      )}
    </group>
  );
}

function CommentInstance({
  comment,
  onHover,
  onSelect,
}: {
  comment: CommentNode;
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const x = Math.cos(comment.orbitAngle) * COMMENT_ORBIT_RADIUS;
  const z = Math.sin(comment.orbitAngle) * COMMENT_ORBIT_RADIUS;
  return (
    <Instance
      position={[x, 0, z]}
      color={comment.color}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: "comment", data: comment });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "comment", data: comment });
      }}
    />
  );
}

function EventInstance({
  event,
  onHover,
  onSelect,
}: {
  event: EventNode;
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const x = Math.cos(event.orbitAngle) * (COMMENT_ORBIT_RADIUS - 0.45);
  const z = Math.sin(event.orbitAngle) * (COMMENT_ORBIT_RADIUS - 0.45);
  return (
    <Instance
      position={[x, 0, z]}
      color={event.color}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: "event", data: event });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "event", data: event });
      }}
    />
  );
}

/* ─── Ancestor chain ───────────────────────────────────────────── */

export function AncestorChain({
  ancestors,
  onHover,
  onSelect,
}: {
  ancestors: AncestorNode[];
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  if (ancestors.length === 0) return null;
  // Height of the full ancestor column — used to draw the luminous spine.
  const spineTop = (ancestors.length + 0.5) * ANCESTOR_STEP;
  return (
    <group>
      {/* Luminous spine — a single vertical thread running through
       *  the whole ancestor column. Reinforces "this is the lineage
       *  above you" as one reading, even though each ancestor is
       *  helically offset. Thin bright core + softer halo. */}
      <AncestorSpine topY={spineTop} />

      {ancestors.map((a, i) => {
        const y = (i + 1) * ANCESTOR_STEP;
        const ringRadius = 1.6 + i * 0.25;
        return (
          <group key={a.id} position={[0, y, 0]}>
            {/* Filament from this ancestor down to the next one */}
            <Line
              points={[
                [0, 0, 0],
                [0, -ANCESTOR_STEP, 0],
              ]}
              color={SCENE.creamDim}
              transparent
              opacity={0.35}
              lineWidth={0.6}
              toneMapped={false}
            />
            {/* The ring */}
            <mesh
              rotation={[Math.PI / 2, 0, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover({ kind: "ancestor", data: a });
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                onHover(null);
                document.body.style.cursor = "";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: "ancestor", data: a });
              }}
            >
              <torusGeometry args={[ringRadius, 0.06, 12, 64]} />
              <meshStandardMaterial
                color={statusColor(a.status)}
                emissive={statusColor(a.status)}
                emissiveIntensity={0.7}
                roughness={0.4}
                metalness={0.2}
                toneMapped={false}
              />
            </mesh>
            {/* Small label */}
            <Text
              position={[ringRadius + 0.3, 0, 0]}
              fontSize={0.22}
              color={SCENE.creamDim}
              anchorX="left"
              anchorY="middle"
              outlineColor="#000"
              outlineWidth={0.006}
              letterSpacing={0.08}
            >
              § {a.identifier}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/* ─── Descendant roots ─────────────────────────────────────────── */

export function DescendantRoots({
  descendants,
  onHover,
  onSelect,
}: {
  descendants: DescendantNode[];
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  if (descendants.length === 0) return null;

  return (
    <group position={[0, -DESCENDANT_STEP, 0]}>
      {descendants.map((d) => {
        const x = Math.cos(d.angle) * DESCENDANT_FAN_RADIUS;
        const z = Math.sin(d.angle) * DESCENDANT_FAN_RADIUS;
        const color = statusColor(d.status);
        return (
          <group key={d.id} position={[x, 0, z]}>
            {/* Filament from the main pillar down to this descendant */}
            <Line
              points={[
                [-x, DESCENDANT_STEP, -z],
                [0, 0, 0],
              ]}
              color={color}
              transparent
              opacity={d.kind === "direct" ? 0.45 : 0.2}
              lineWidth={d.kind === "direct" ? 1 : 0.5}
              toneMapped={false}
            />
            {/* The descendant shard */}
            <mesh
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover({ kind: "descendant", data: d });
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                onHover(null);
                document.body.style.cursor = "";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: "descendant", data: d });
              }}
            >
              <icosahedronGeometry args={[0.45, 1]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={d.kind === "direct" ? 1.2 : 0.6}
                roughness={0.35}
                metalness={0.2}
                toneMapped={false}
              />
            </mesh>
            {/* Identifier below */}
            <Text
              position={[0, -0.75, 0]}
              fontSize={0.2}
              color={SCENE.creamDim}
              anchorX="center"
              anchorY="top"
              outlineColor="#000"
              outlineWidth={0.005}
              letterSpacing={0.08}
            >
              § {d.identifier}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/* ─── Approval portals (above the pillar) ──────────────────────── */

export function ApprovalPortals({
  approvals,
  onHover,
  onSelect,
}: {
  approvals: ApprovalNode[];
  onHover: HoverHandler;
  onSelect: SelectHandler;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.12;
    }
  });

  if (approvals.length === 0) return null;

  return (
    <group ref={groupRef} position={[0, APPROVAL_RING_Y, 0]}>
      {approvals.map((a) => {
        const x = Math.cos(a.angle) * APPROVAL_RING_RADIUS;
        const z = Math.sin(a.angle) * APPROVAL_RING_RADIUS;
        const isPending = a.status === "pending";
        const color = isPending ? "#FBBF24" : a.status === "approved" ? "#34D399" : "#F43F5E";
        return (
          <mesh
            key={a.id}
            position={[x, 0, z]}
            rotation={[Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ kind: "approval", data: a });
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              onHover(null);
              document.body.style.cursor = "";
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "approval", data: a });
            }}
          >
            <torusGeometry args={[0.35, 0.05, 12, 32]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isPending ? 2 : 0.9}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
