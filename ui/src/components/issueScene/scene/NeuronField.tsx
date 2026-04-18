/* ─────────────────────────────────────────────────────────────────────
 *  NeuronField — cortical tissue around the pillar.
 *
 *  Dense field of cell bodies (~500) in a shell around the neuron
 *  core. Each cell has:
 *    · branching dendrites (3-5 short line wisps at random angles)
 *    · emissive core sphere that brightens when firing
 *    · an additive-blended halo sphere that only appears mid-fire
 *    · gentle 3-axis wobble so the tissue breathes
 *
 *  Firing logic:
 *    · Every ~100ms a burst of 2-5 random cells fires.
 *    · Firing state decays ~0.35s.
 *    · Neighbouring cells have a chance to trigger in cascade
 *      (synaptic propagation — short-range spatial kernel).
 *
 *  All per-frame work is in one useFrame updating two InstancedMesh
 *  matrices — no React re-renders.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { SCENE } from "../colors";

interface NeuronFieldProps {
  dim?: boolean;
  count?: number;
}

/** Fast deterministic hash → [0,1) */
function hash01(i: number): number {
  let h = 2166136261 ^ (i * 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h >>> 16) & 0xffff) / 65536;
}

export function NeuronField({ dim = false, count = 520 }: NeuronFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  /* Cells: position, drift phase, size, cached neighbours for cascade. */
  const cells = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Thick shell 8→22, weighted slightly outward so the pillar
      // has clear room, and the cells gather around the orbital
      // shells where the action is.
      const u = hash01(i * 13 + 1);
      const r = 8 + Math.pow(u, 0.7) * 14;
      const theta = hash01(i * 7 + 3) * Math.PI * 2;
      const phi = Math.acos(2 * hash01(i * 11 + 5) - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.6;
      positions[i * 3 + 2] = Math.cos(phi) * r;
      phases[i] = hash01(i * 17 + 9) * Math.PI * 2;
      baseSizes[i] = 1.0 + hash01(i * 23 + 11) * 1.2;
    }

    // Cache ~3 nearest neighbours per cell for cascade propagation.
    // O(n²) once at mount; n=520 ≈ 270k ops — fine.
    const neighbours = new Int16Array(count * 3);
    const dists = new Float32Array(3);
    for (let i = 0; i < count; i++) {
      dists[0] = dists[1] = dists[2] = Infinity;
      neighbours[i * 3] = neighbours[i * 3 + 1] = neighbours[i * 3 + 2] = -1;
      const ix = positions[i * 3], iy = positions[i * 3 + 1], iz = positions[i * 3 + 2];
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const dx = positions[j * 3] - ix;
        const dy = positions[j * 3 + 1] - iy;
        const dz = positions[j * 3 + 2] - iz;
        const d = dx * dx + dy * dy + dz * dz;
        for (let s = 0; s < 3; s++) {
          if (d < dists[s]) {
            // Insertion sort into the top-3 list.
            for (let k = 2; k > s; k--) {
              dists[k] = dists[k - 1];
              neighbours[i * 3 + k] = neighbours[i * 3 + k - 1];
            }
            dists[s] = d;
            neighbours[i * 3 + s] = j;
            break;
          }
        }
      }
    }
    return { positions, phases, baseSizes, neighbours };
  }, [count]);

  /* Firing state per cell [0..1]. */
  const fireRef = useRef<Float32Array>(new Float32Array(count));
  const nextFireAtRef = useRef<number>(0);

  /* Pending cascade triggers: when a neighbour should fire, queue it
   * here so it starts one frame later, not in the middle of the
   * current frame's pass. */
  const pendingRef = useRef<Array<{ idx: number; at: number; strength: number }>>([]);

  /* Dendrite sketches — one set per cell, 3-5 short segments. */
  const dendrites = useMemo(() => {
    const out: Array<{
      key: string;
      points: [number, number, number][];
      color: string;
      opacity: number;
    }> = [];
    for (let i = 0; i < count; i++) {
      const cx = cells.positions[i * 3];
      const cy = cells.positions[i * 3 + 1];
      const cz = cells.positions[i * 3 + 2];
      const branches = 3 + Math.floor(hash01(i * 29 + 13) * 3);
      for (let b = 0; b < branches; b++) {
        const theta = hash01(i * 31 + b * 7 + 17) * Math.PI * 2;
        const phi = Math.acos(2 * hash01(i * 37 + b * 11 + 19) - 1);
        const len = 0.35 + hash01(i * 41 + b * 13 + 23) * 0.6;
        const dx = Math.sin(phi) * Math.cos(theta) * len;
        const dy = Math.sin(phi) * Math.sin(theta) * len;
        const dz = Math.cos(phi) * len;
        // Add a midpoint kink so dendrites curve like real axons.
        const kx = dx * 0.55 + (hash01(i * 43 + b * 17 + 29) - 0.5) * 0.15;
        const ky = dy * 0.55 + (hash01(i * 47 + b * 19 + 31) - 0.5) * 0.15;
        const kz = dz * 0.55 + (hash01(i * 53 + b * 23 + 37) - 0.5) * 0.15;
        out.push({
          key: `d-${i}-${b}`,
          points: [
            [cx, cy, cz],
            [cx + kx, cy + ky, cz + kz],
            [cx + dx, cy + dy, cz + dz],
          ],
          color: SCENE.creamDim,
          opacity: 0.12 + hash01(i * 59 + b * 29 + 41) * 0.12,
        });
      }
    }
    return out;
  }, [cells.positions, count]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const mesh = meshRef.current;
    const halo = haloRef.current;
    if (!mesh) return;

    /* Random spontaneous firings every ~0.08s. */
    if (t >= nextFireAtRef.current) {
      const seed = Math.floor(t * 1000) | 0;
      const burst = 2 + Math.floor(hash01(seed + 5) * 4);
      for (let b = 0; b < burst; b++) {
        const idx = Math.floor(hash01(seed + b * 7) * count);
        fireRef.current[idx] = Math.max(fireRef.current[idx], 1);
      }
      nextFireAtRef.current = t + 0.04 + hash01(seed + 1) * 0.14;
    }

    /* Drain pending cascade triggers. */
    while (pendingRef.current.length > 0) {
      const next = pendingRef.current[0];
      if (next.at > t) break;
      pendingRef.current.shift();
      if (next.idx >= 0 && next.idx < count) {
        fireRef.current[next.idx] = Math.max(
          fireRef.current[next.idx],
          next.strength,
        );
      }
    }

    const dimMul = dim ? 0.55 : 1;

    for (let i = 0; i < count; i++) {
      const px = cells.positions[i * 3];
      const py = cells.positions[i * 3 + 1];
      const pz = cells.positions[i * 3 + 2];
      const phase = cells.phases[i];
      // Gentle 3-axis drift. Amplitude matches a ~0.2-unit wobble.
      const ox = Math.sin(t * 0.32 + phase) * 0.1;
      const oy = Math.cos(t * 0.38 + phase * 1.2) * 0.1;
      const oz = Math.sin(t * 0.27 + phase * 0.7) * 0.1;

      // Decay firing state. 0.35s pulse length.
      const fire = fireRef.current[i];
      const nextFire = fire > 0 ? Math.max(0, fire - delta * 2.8) : 0;

      // Cascade trigger: if this cell just CROSSED the 0.7 threshold
      // going down, propagate to its cached neighbours with 35% chance.
      if (fire >= 0.75 && nextFire < 0.75) {
        for (let k = 0; k < 3; k++) {
          const nIdx = cells.neighbours[i * 3 + k];
          if (nIdx < 0) continue;
          if (hash01(i * 101 + k * 17 + Math.floor(t * 60)) < 0.38) {
            pendingRef.current.push({
              idx: nIdx,
              at: t + 0.05 + hash01(i * 83 + k * 11) * 0.05,
              strength: 0.85,
            });
          }
        }
      }
      fireRef.current[i] = nextFire;

      const wx = px + ox, wy = py + oy, wz = pz + oz;

      // Cell body scale — bigger when firing.
      const scale = cells.baseSizes[i] * 0.14 * (1 + nextFire * 1.8) * dimMul;
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Colour: warm bronze at rest, peak cream at firing crest.
      const warm = 0.5 + nextFire * 1.4;
      colorObj.set(SCENE.cream).multiplyScalar(warm * dimMul);
      mesh.setColorAt(i, colorObj);

      // Halo — only during firing.
      if (halo) {
        const hScale = nextFire > 0.05
          ? cells.baseSizes[i] * 0.7 * nextFire * dimMul
          : 0;
        dummy.position.set(wx, wy, wz);
        dummy.scale.setScalar(hScale);
        dummy.updateMatrix();
        halo.setMatrixAt(i, dummy.matrix);

        const haloAlpha = nextFire * 0.9 * dimMul;
        colorObj.set(SCENE.cream).multiplyScalar(haloAlpha);
        halo.setColorAt(i, colorObj);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (halo) {
      halo.instanceMatrix.needsUpdate = true;
      if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Dendrites: 3-segment polylines with a midpoint kink. */}
      {dendrites.map((d) => (
        <Line
          key={d.key}
          points={d.points}
          color={d.color}
          lineWidth={0.013}
          transparent
          opacity={dim ? d.opacity * 0.5 : d.opacity}
        />
      ))}

      {/* Cell bodies — emissive cream spheres, tone-mapped off so the
          per-instance colour is the output brightness. */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.95} />
      </instancedMesh>

      {/* Firing halos — larger additive-blended spheres, scale=0
          when idle so they don't cost overdraw most of the time. */}
      <instancedMesh
        ref={haloRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
