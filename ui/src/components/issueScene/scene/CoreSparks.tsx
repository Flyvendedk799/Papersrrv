/* ─────────────────────────────────────────────────────────────────────
 *  CoreSparks — small amber particles rising from the pillar's base.
 *
 *  Visual read: "the matter is hot / radiating". These tiny sparks spawn
 *  near y≈-1 at a small radius around origin, drift upward with a slight
 *  curl, fade as they rise, and respawn. Pure vertex-shader motion so
 *  cost is near-zero.
 *
 *  Rationale: a static pillar feels dead. A faint trail of sparks gives
 *  the core a sense of energy without competing with the Bloom on the
 *  main pillar itself.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SPARK_COUNT = 140;
const RISE_HEIGHT = 5.2;
const LIFETIME = 3.8; // seconds per full rise cycle

export function CoreSparks() {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, seeds, lifeOffsets } = useMemo(() => {
    const pos = new Float32Array(SPARK_COUNT * 3);
    const sd = new Float32Array(SPARK_COUNT);
    const lo = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) {
      // Ring around pillar base — inner radius ~0.25, outer ~1.1.
      const r = 0.25 + Math.random() * 0.85;
      const theta = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = -1 + Math.random() * 0.2;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      sd[i] = Math.random() * 100;
      lo[i] = Math.random() * LIFETIME;
    }
    return { positions: pos, seeds: sd, lifeOffsets: lo };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: {
        value:
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2)
            : 1,
      },
      uRise: { value: RISE_HEIGHT },
      uLifetime: { value: LIFETIME },
    }),
    [],
  );

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points frustumCulled={false} ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={SPARK_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-seed"
          args={[seeds, 1]}
          count={SPARK_COUNT}
          array={seeds}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-lifeoffset"
          args={[lifeOffsets, 1]}
          count={SPARK_COUNT}
          array={lifeOffsets}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          uniform float uTime;
          uniform float uPixelRatio;
          uniform float uRise;
          uniform float uLifetime;
          attribute float seed;
          attribute float lifeoffset;
          varying float vLife;
          void main() {
            float t = mod(uTime + lifeoffset, uLifetime) / uLifetime;
            vLife = t;

            // Rise with slight ease-out.
            float y = position.y + t * uRise * (1.0 - 0.25 * t);

            // Gentle curl — angular drift scaled by height.
            float swirl = t * 0.9 + seed * 0.3;
            float sx = sin(swirl) * t * 0.35;
            float sz = cos(swirl * 1.1) * t * 0.35;

            vec3 p = vec3(position.x + sx, y, position.z + sz);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float size = (3.2 - t * 2.4) * uPixelRatio;
            gl_PointSize = max(1.0, size);
          }
        `}
        fragmentShader={`
          varying float vLife;
          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv) * 2.0;
            if (d > 1.0) discard;
            float core = pow(1.0 - d, 1.8);
            // Amber → dim red as the spark ages.
            vec3 hot = vec3(1.0, 0.78, 0.32);
            vec3 cool = vec3(0.55, 0.18, 0.08);
            vec3 col = mix(hot, cool, vLife);
            // Fade in quickly, fade out over the back half.
            float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
            gl_FragColor = vec4(col * core * fade, core * fade * 0.9);
          }
        `}
      />
    </points>
  );
}
