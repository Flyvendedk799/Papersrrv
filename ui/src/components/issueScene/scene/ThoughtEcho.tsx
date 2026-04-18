/* ─────────────────────────────────────────────────────────────────────
 *  ThoughtEcho — expanding translucent rings at firing epicenters.
 *
 *  Every ~450ms a new echo is spawned at a random point near the
 *  neuron core. Each echo is a thin cream ring that grows from
 *  ~0.5 to ~6 world units while fading, then retires. Runs a small
 *  pool (8 echoes max) so we never allocate geometry per event.
 *
 *  Visual intent: the sphere looks like a brain firing — synaptic
 *  action potentials literally radiate through the tissue.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

interface ThoughtEchoProps {
  /** Max concurrent echoes. */
  poolSize?: number;
  /** Mean interval (seconds) between echo spawns. */
  interval?: number;
  /** When true, echoes dim/recede. */
  dim?: boolean;
}

interface EchoSlot {
  active: boolean;
  pos: THREE.Vector3;
  t: number;
  duration: number;
  maxR: number;
}

export function ThoughtEcho({
  poolSize = 8,
  interval = 0.45,
  dim = false,
}: ThoughtEchoProps) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const slots = useRef<EchoSlot[]>(
    Array.from({ length: poolSize }, () => ({
      active: false,
      pos: new THREE.Vector3(),
      t: 0,
      duration: 1,
      maxR: 4,
    })),
  );
  const nextAtRef = useRef(0);

  const tmpUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;

    /* Spawn a new echo. */
    if (now >= nextAtRef.current) {
      const free = slots.current.findIndex((s) => !s.active);
      if (free >= 0) {
        const slot = slots.current[free];
        slot.active = true;
        // Position biased toward the orbital shell where most activity
        // happens (r ~ 4-10 from origin).
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 3 + Math.random() * 7;
        slot.pos.set(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.sin(phi) * Math.sin(theta) * r * 0.65,
          Math.cos(phi) * r,
        );
        slot.t = 0;
        slot.duration = 1.1 + Math.random() * 0.5;
        slot.maxR = 3.5 + Math.random() * 2.5;
      }
      nextAtRef.current = now + interval * (0.55 + Math.random() * 0.7);
    }

    /* Advance active echoes. */
    for (let i = 0; i < slots.current.length; i++) {
      const slot = slots.current[i];
      const mesh = meshes.current[i];
      if (!mesh) continue;
      if (!slot.active) {
        mesh.scale.setScalar(0);
        continue;
      }
      slot.t += delta;
      const u = slot.t / slot.duration;
      if (u >= 1) {
        slot.active = false;
        mesh.scale.setScalar(0);
        continue;
      }
      // Expand from 0.3 → maxR with an easeOut curve.
      const scale = slot.maxR * (1 - Math.pow(1 - u, 2.5));
      mesh.position.copy(slot.pos);
      mesh.scale.set(scale, scale, scale);
      // Orient the ring to face a random axis at spawn (via lookAt on
      // a fixed offset so it tilts organically).
      mesh.lookAt(tmpUp);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      // Fade out smoothly; peak at 15% of duration.
      const fade = u < 0.15
        ? u / 0.15
        : 1 - (u - 0.15) / 0.85;
      const alpha = fade * 0.4 * (dim ? 0.5 : 1);
      if (mat.opacity !== alpha) mat.opacity = alpha;
    }
  });

  return (
    <group ref={group}>
      {slots.current.map((_, i) => (
        <mesh
          key={`echo-${i}`}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          scale={0}
        >
          {/* Thin torus — reads as a ring of firing tissue. */}
          <torusGeometry args={[1, 0.05, 8, 48]} />
          <meshBasicMaterial
            color={SCENE.cream}
            transparent
            opacity={0}
            toneMapped={false}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
