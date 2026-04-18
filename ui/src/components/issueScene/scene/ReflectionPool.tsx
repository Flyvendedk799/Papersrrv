/* ─────────────────────────────────────────────────────────────────────
 *  ReflectionPool — a soft status-colored radial glow at the ground
 *  plane beneath the pillar.
 *
 *  Grounds the pillar in space. Without this, the pillar hovers in a
 *  perfectly symmetrical void. The pool gives the eye a horizontal
 *  reference point and a sense that the pillar is standing ON
 *  something rather than suspended.
 *
 *  Single mesh: a thin circle at y ≈ -2.5 with a radial-falloff shader
 *  (bright center, alpha-out by the rim). Additive-blended so it layers
 *  over the substrate particles naturally and doesn't punch a hole.
 *
 *  Slow breath tied to livePulse — more activity = brighter pool.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ReflectionPoolProps {
  /** Status hex. */
  color: string;
  /** 0..1 — brightness multiplier. */
  livePulse: number;
}

const POOL_RADIUS = 6.5;

export function ReflectionPool({ color, livePulse }: ReflectionPoolProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uLive: { value: livePulse },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useMemo(() => {
    uniforms.uColor.value.set(color);
    uniforms.uLive.value = livePulse;
  }, [color, livePulse, uniforms]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]}>
      <circleGeometry args={[POOL_RADIUS, 80]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uLive;
          varying vec2 vUv;

          void main() {
            /* Distance from circle center, 0 at center → 1 at rim. */
            float d = length(vUv - vec2(0.5, 0.5)) * 2.0;
            if (d > 1.0) discard;

            /* Soft inner falloff — very bright at center, gone at rim. */
            float core = pow(1.0 - d, 2.0);
            /* A secondary softer halo at mid-radius for a "pool" feel. */
            float halo = smoothstep(0.9, 0.3, d) * 0.4;

            float breath = 0.9 + 0.1 * sin(uTime * 1.1);
            float alpha = (core + halo) * breath * (0.45 + uLive * 0.4);

            gl_FragColor = vec4(uColor * (0.9 + uLive * 0.4), alpha);
          }
        `}
      />
    </mesh>
  );
}
