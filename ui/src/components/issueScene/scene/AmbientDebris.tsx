/* ─────────────────────────────────────────────────────────────────────
 *  AmbientDebris — slowly rotating geometric shards floating in the
 *  middle distance around the scene.
 *
 *  A sparse spray of tiny tetrahedron / octahedron wireframe shards
 *  at random stable positions between radius 10 and 20. Each shard:
 *    · rotates on its own axis, slowly
 *    · floats with a small Y bob
 *    · holds a dim cream wireframe so it reads as structural texture,
 *      not a competing light
 *
 *  Purpose: the space between the orbits and the StarFlecks was
 *  empty. These shards fill that gap with visible "stuff" so the
 *  depth read has layers all the way out.
 *
 *  Performance: 18 shards total. 18 draw calls (small). Shared
 *  wireframe material. Well under any budget.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

const SHARD_COUNT = 18;
const INNER_R = 10;
const OUTER_R = 19;

interface ShardSpec {
  position: [number, number, number];
  baseY: number;
  rotSpeed: [number, number, number];
  bobPhase: number;
  bobAmp: number;
  scale: number;
  geomKind: 0 | 1 | 2;
}

function buildShards(): ShardSpec[] {
  const rng = mulberry32(0xc1ab5e); // stable seed so shards don't jump on re-mount
  const out: ShardSpec[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const r = INNER_R + rng() * (OUTER_R - INNER_R);
    const theta = rng() * Math.PI * 2;
    // Flatten Y scatter so shards hug the "disk" of the scene.
    const yJitter = (rng() - 0.5) * 6;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    out.push({
      position: [x, yJitter, z],
      baseY: yJitter,
      rotSpeed: [
        (rng() - 0.5) * 0.3,
        (rng() - 0.5) * 0.4,
        (rng() - 0.5) * 0.25,
      ],
      bobPhase: rng() * Math.PI * 2,
      bobAmp: 0.08 + rng() * 0.22,
      scale: 0.18 + rng() * 0.35,
      geomKind: Math.floor(rng() * 3) as 0 | 1 | 2,
    });
  }
  return out;
}

/** Deterministic PRNG so the shard positions don't re-shuffle on HMR. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function AmbientDebris() {
  const shards = useMemo(() => buildShards(), []);
  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < shards.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const s = shards[i];
      g.rotation.x += s.rotSpeed[0] * 0.016;
      g.rotation.y += s.rotSpeed[1] * 0.016;
      g.rotation.z += s.rotSpeed[2] * 0.016;
      g.position.y = s.baseY + Math.sin(t * 0.3 + s.bobPhase) * s.bobAmp;
    }
  });

  return (
    <group frustumCulled={false}>
      {shards.map((s, i) => (
        <group
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          position={s.position}
          scale={s.scale}
        >
          {s.geomKind === 0 && (
            <mesh>
              <tetrahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                color={SCENE.creamDim}
                wireframe
                transparent
                opacity={0.22}
                toneMapped={false}
              />
            </mesh>
          )}
          {s.geomKind === 1 && (
            <mesh>
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                color={SCENE.creamDim}
                wireframe
                transparent
                opacity={0.22}
                toneMapped={false}
              />
            </mesh>
          )}
          {s.geomKind === 2 && (
            <mesh>
              <icosahedronGeometry args={[0.9, 0]} />
              <meshBasicMaterial
                color={SCENE.creamDim}
                wireframe
                transparent
                opacity={0.22}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
