/* ─────────────────────────────────────────────────────────────────────
 *  CognitiveCloud — warm volumetric mist around the neuron core.
 *
 *  ~180 translucent sprites scattered close to origin, with additive
 *  blending so they bloom the core area. Pulses gently with
 *  `livePulse` (how active the issue is).
 *
 *  Adds the "thinking about this issue" volumetric glow that makes
 *  the scene feel cognitive rather than geometric.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

interface CognitiveCloudProps {
  livePulse: number;
  dim?: boolean;
  count?: number;
}

function hash01(i: number): number {
  let h = 2166136261 ^ (i * 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h >>> 16) & 0xffff) / 65536;
}

export function CognitiveCloud({
  livePulse,
  dim = false,
  count = 180,
}: CognitiveCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const cells = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Shell close to the core (r = 1 → 4.5) so the cloud visually
      // hugs the pillar rather than diffusing out.
      const u = hash01(i * 13 + 1);
      const r = 1 + Math.pow(u, 1.8) * 3.5;
      const theta = hash01(i * 7 + 3) * Math.PI * 2;
      const phi = Math.acos(2 * hash01(i * 11 + 5) - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.75;
      positions[i * 3 + 2] = Math.cos(phi) * r;
      phases[i] = hash01(i * 17 + 9) * Math.PI * 2;
      sizes[i] = 0.7 + hash01(i * 23 + 11) * 1.5;
    }
    return { positions, phases, sizes };
  }, [count]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const mesh = meshRef.current;
    if (!mesh) return;
    const pulseMul = 1 + livePulse * 0.35;
    const dimMul = dim ? 0.55 : 1;

    for (let i = 0; i < count; i++) {
      const px = cells.positions[i * 3];
      const py = cells.positions[i * 3 + 1];
      const pz = cells.positions[i * 3 + 2];
      const ph = cells.phases[i];

      // Slow swirl around the core so the cloud feels alive.
      const swirl = t * 0.06 + ph;
      const cosS = Math.cos(swirl);
      const sinS = Math.sin(swirl);
      const wx = px * cosS - pz * sinS;
      const wz = px * sinS + pz * cosS;
      const wy = py + Math.sin(t * 0.4 + ph * 1.3) * 0.15;

      // Breathing scale — syncs gently with livePulse.
      const breath = 1 + Math.sin(t * 1.1 + ph) * 0.18;
      const s = cells.sizes[i] * 0.45 * breath * pulseMul * dimMul;
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Warm cream, dimmer farther from core.
      const r = Math.hypot(wx, wy, wz);
      const falloff = Math.max(0.3, 1 - r / 5);
      color.set(SCENE.cream).multiplyScalar(falloff * 0.25 * pulseMul * dimMul);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        toneMapped={false}
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
