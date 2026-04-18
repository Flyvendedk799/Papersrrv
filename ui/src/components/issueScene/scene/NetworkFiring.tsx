/* ─────────────────────────────────────────────────────────────────────
 *  NetworkFiring — background "thought pulses" through the synapse
 *  graph.
 *
 *  Complementary to the live axon pulses in Synapses.tsx (those only
 *  fire on live runs). This component picks RANDOM edges every
 *  ~250ms and sends a quick cream droplet along them — so even a
 *  dormant issue's brain looks like it's thinking.
 *
 *  Uses a small pool of reusable droplet meshes so adding a firing
 *  burst costs one pool rotation, not a geometry allocation.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SynapseEdge, Vec3 } from "../data/types";
import { SCENE } from "../colors";

interface NetworkFiringProps {
  edges: SynapseEdge[];
  /** How many simultaneous ghost pulses the pool supports. Keep small
   *  — too many and the eye can't distinguish "the network is busy"
   *  from "everything is busy". */
  poolSize?: number;
  /** Mean interval (seconds) between new ghost firings. */
  firingIntervalMean?: number;
}

interface PulseSlot {
  active: boolean;
  edgeIdx: number;
  t: number;          // progress along edge [0,1]
  speed: number;      // progress per second
  color: THREE.Color;
}

/** Build a quadratic bezier from pillar origin to edge.to with a
 *  deterministic perpendicular bow — mirrors the bezier used by
 *  Synapses.tsx so ghost pulses travel along the visible ink trail,
 *  not a straight line underneath it. */
function bezierAt(
  to: Vec3,
  id: string,
  u: number,
  out: THREE.Vector3,
): void {
  const [x, y, z] = to;
  const len = Math.hypot(x, y, z);
  if (len < 0.01) {
    out.set(x * u, y * u, z * u);
    return;
  }
  const ax = x / len, ay = y / len, az = z / len;
  let px = -az, py = 0, pz = ax;
  const mag = Math.hypot(px, py, pz);
  if (mag < 0.01) { px = 0; py = 1; pz = 0; }
  else { px /= mag; pz /= mag; }
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) | 0;
  const seed = ((h >>> 0) % 100000) / 100000;
  const bow = 0.35 + seed * 0.55;
  const midX = x * 0.5 + px * bow;
  const midY = y * 0.5 + (seed - 0.5) * 0.7;
  const midZ = z * 0.5 + pz * bow;
  const o = 1 - u;
  out.set(
    2 * o * u * midX + u * u * x,
    2 * o * u * midY + u * u * y,
    2 * o * u * midZ + u * u * z,
  );
}

export function NetworkFiring({
  edges,
  poolSize = 6,
  firingIntervalMean = 0.26,
}: NetworkFiringProps) {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const slots = useRef<PulseSlot[]>(
    Array.from({ length: poolSize }, () => ({
      active: false,
      edgeIdx: 0,
      t: 0,
      speed: 1,
      color: new THREE.Color(SCENE.cream),
    })),
  );
  const nextFireAtRef = useRef(0);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;

    /* Maybe spawn a new ghost firing — picks a random edge that
     * isn't already someone's current target, and a random free
     * slot in the pool. */
    if (edges.length > 0 && now >= nextFireAtRef.current) {
      const freeSlot = slots.current.findIndex((s) => !s.active);
      if (freeSlot >= 0) {
        const edgeIdx = Math.floor(Math.random() * edges.length);
        const edge = edges[edgeIdx];
        const slot = slots.current[freeSlot];
        slot.active = true;
        slot.edgeIdx = edgeIdx;
        slot.t = 0;
        slot.speed = 1.4 + Math.random() * 0.9;
        // Cream tinted toward the edge's own color so the pulse
        // reads as tied to its specific synapse.
        slot.color.set(edge.color).lerp(new THREE.Color(SCENE.cream), 0.6);
      }
      nextFireAtRef.current = now + firingIntervalMean * (0.7 + Math.random() * 0.6);
    }

    /* Advance all active slots. */
    for (let i = 0; i < slots.current.length; i++) {
      const slot = slots.current[i];
      const mesh = meshes.current[i];
      if (!mesh) continue;
      if (!slot.active) {
        // Hide the mesh by scaling to 0 — cheaper than mounting/unmounting.
        mesh.scale.setScalar(0);
        continue;
      }
      slot.t += delta * slot.speed;
      if (slot.t >= 1) {
        slot.active = false;
        mesh.scale.setScalar(0);
        continue;
      }

      const edge = edges[slot.edgeIdx];
      if (!edge) {
        slot.active = false;
        mesh.scale.setScalar(0);
        continue;
      }

      bezierAt(edge.to, edge.id, slot.t, tmpVec);
      mesh.position.copy(tmpVec);
      // Fade in/out with a sinusoid — fat in the middle, thin at edges.
      const fade = Math.sin(Math.PI * slot.t);
      const scale = 0.07 + fade * 0.1;
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.opacity !== fade * 0.9) mat.opacity = fade * 0.9;
      if (mat.color !== slot.color) {
        mat.color.copy(slot.color);
      }
    }
  });

  return (
    <group>
      {slots.current.map((_, i) => (
        <mesh
          key={`firing-${i}`}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          scale={0}
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
