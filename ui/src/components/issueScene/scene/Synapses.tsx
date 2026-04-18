/* ─────────────────────────────────────────────────────────────────────
 *  Synapses — the visible nervous system of the Deliberation Sphere.
 *
 *  For every SynapseEdge in the graph:
 *    · Renders a gentle bezier-curved line from origin to node.
 *    · Width and opacity scale with edge.strength.
 *    · Colored by edge.color (agent or status).
 *    · Live edges carry a bright ink-droplet that travels 0 → 1 → 0.
 *
 *  The whole thing uses drei's <Line> for efficient geometry reuse; the
 *  live droplets are a single instanced points mesh updated in useFrame
 *  so adding edges doesn't balloon the render cost.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { SynapseEdge, Vec3 } from "../data/types";
import { SCENE } from "../colors";

interface SynapsesProps {
  edges: SynapseEdge[];
  /** Set of node IDs currently being highlighted by a lens. When
   *  non-empty, edges whose source OR target is NOT in the set dim
   *  to ~18% opacity. */
  highlightIds?: Set<string> | null;
}

/** Build a quadratic bezier curve from origin out to `to`, bowed
 *  perpendicular to the spoke so it reads as an ink stroke, not a
 *  straight telegraph wire. */
function bezierPoints(to: Vec3, id: string, segments = 22): Vec3[] {
  const [x, y, z] = to;
  const len = Math.hypot(x, y, z);
  if (len < 0.01) return [[0, 0, 0], to];
  // Perpendicular direction (not colinear with up).
  const ax = x / len, ay = y / len, az = z / len;
  let px = -az, py = 0, pz = ax;
  const mag = Math.hypot(px, py, pz);
  if (mag < 0.01) { px = 0; py = 1; pz = 0; }
  else { px /= mag; pz /= mag; }
  // Deterministic bow amount from id.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) | 0;
  const seed = ((h >>> 0) % 100000) / 100000;
  const bow = 0.35 + seed * 0.55;
  const midX = x * 0.5 + px * bow;
  const midY = y * 0.5 + (seed - 0.5) * 0.7;
  const midZ = z * 0.5 + pz * bow;
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const o = 1 - t;
    out.push([
      2 * o * t * midX + t * t * x,
      2 * o * t * midY + t * t * y,
      2 * o * t * midZ + t * t * z,
    ]);
  }
  return out;
}

interface PreparedEdge {
  edge: SynapseEdge;
  points: Vec3[];
  width: number;
  opacity: number;
}

export function Synapses({ edges, highlightIds }: SynapsesProps) {
  const prepared = useMemo<PreparedEdge[]>(() => {
    return edges.map((edge) => ({
      edge,
      points: bezierPoints(edge.to, edge.id),
      width: 0.01 + edge.strength * 0.05,
      opacity: 0.22 + edge.strength * 0.55,
    }));
  }, [edges]);

  const isDim = (edge: SynapseEdge): boolean => {
    if (!highlightIds || highlightIds.size === 0) return false;
    return !highlightIds.has(edge.sourceId) && !highlightIds.has(edge.targetId);
  };

  return (
    <group>
      {prepared.map(({ edge, points, width, opacity }) => {
        const dim = isDim(edge);
        return (
          <Line
            key={edge.id}
            points={points as unknown as [number, number, number][]}
            color={edge.color}
            lineWidth={width * (dim ? 0.6 : 1)}
            transparent
            opacity={opacity * (dim ? 0.22 : 1)}
            dashed={!!edge.dashed}
            dashScale={edge.dashed ? 40 : undefined}
            dashSize={edge.dashed ? 0.18 : undefined}
            gapSize={edge.dashed ? 0.12 : undefined}
          />
        );
      })}
      <AxonPulses prepared={prepared} highlightIds={highlightIds} />
    </group>
  );
}

/* ─── Live pulses — moving droplets along live edges ─────────────── */

interface AxonPulsesProps {
  prepared: PreparedEdge[];
  highlightIds?: Set<string> | null;
}

/**
 * Renders one small emissive sphere per live edge, moving along the
 * bezier from origin → node and fading at the ends. We pre-sample the
 * curve into a flat Float32Array per edge so useFrame() just does a
 * lookup — no re-geometry each frame.
 */
function AxonPulses({ prepared, highlightIds }: AxonPulsesProps) {
  const live = useMemo(() => prepared.filter((p) => p.edge.livePulse), [prepared]);
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const phases = useMemo(
    () => live.map((_, i) => (i * 0.317) % 1), // deterministic staggered starts
    [live],
  );

  useFrame((_, delta) => {
    // ~0.7 second period per pulse, loop.
    const speed = 1 / 0.9;
    for (let i = 0; i < live.length; i++) {
      phases[i] = (phases[i] + delta * speed) % 1;
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const t = phases[i];
      const pts = live[i].points;
      const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
      const localT = t * (pts.length - 1) - seg;
      const a = pts[seg];
      const b = pts[seg + 1];
      mesh.position.set(
        a[0] + (b[0] - a[0]) * localT,
        a[1] + (b[1] - a[1]) * localT,
        a[2] + (b[2] - a[2]) * localT,
      );
      // Fade near endpoints.
      const fade = Math.sin(Math.PI * t);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const dim = highlightIds && highlightIds.size > 0 &&
        !highlightIds.has(live[i].edge.sourceId) &&
        !highlightIds.has(live[i].edge.targetId);
      mat.opacity = fade * (dim ? 0.2 : 0.95);
      const s = 0.12 + fade * 0.16;
      mesh.scale.setScalar(s);
    }
  });

  return (
    <group>
      {live.map(({ edge }, i) => (
        <mesh
          key={`pulse:${edge.id}`}
          ref={(m) => { meshes.current[i] = m; }}
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial
            color={SCENE.cream}
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
