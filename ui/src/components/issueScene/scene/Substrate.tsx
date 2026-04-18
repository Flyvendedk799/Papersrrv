/* ─────────────────────────────────────────────────────────────────────
 *  Substrate — atmospheric particle field behind the main scene
 *
 *  Thin, numerous, not a protagonist. 3k warm-cream particles drifting
 *  slowly in a sphere around the pillar. Positions are randomized once
 *  at mount; motion is driven by a vertex shader with a per-vertex
 *  phase so waves roll smoothly through the field.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

/* Reduced from 4,500 → 1,800 so the foreground neurons have room
 * to breathe. Substrate is now a faint warm dust rather than a
 * dominating starfield. */
const PARTICLE_COUNT = 1800;
const RADIUS = 28;

interface SubstrateProps {
  /** When true, the particle field dims to ~65% — used to make the
   *  background recede when the viewer is focused on a hovered node. */
  dim?: boolean;
}

export function Substrate({ dim = false }: SubstrateProps = {}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, phases, hues } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const ph = new Float32Array(PARTICLE_COUNT);
    const hu = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Strong outer bias — keeps the pillar silhouette clear while
      // crowding the far shell with atmospheric dust.
      const u = Math.random();
      const radialFactor = 0.7 + u * 0.3;
      const r = radialFactor * RADIUS;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.55;
      pos[i * 3 + 2] = Math.cos(phi) * r;
      ph[i] = Math.random() * Math.PI * 2;
      // Hue mix: 0 = close (warm gold), 1 = far (cool blue-white)
      hu[i] = radialFactor;
    }
    return { positions: pos, phases: ph, hues: hu };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(SCENE.cream) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      /* 1 = full, 0.65 = dimmed-on-hover. Lerped each frame toward
       * the desired target so the fade is smooth, not a hard cut. */
      uOpacityMult: { value: 1 },
    }),
    [],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.015;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-phase"
          args={[phases, 1]}
          count={PARTICLE_COUNT}
          array={phases}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          uniform float uTime;
          uniform float uPixelRatio;
          attribute float phase;
          varying float vAlpha;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            // Size falls with depth so distant particles are tiny points
            gl_PointSize = 2.2 * uPixelRatio * (12.0 / -mvPosition.z);
            // Breath wave — per-particle phase so waves roll smoothly
            float wave = 0.55 + 0.45 * sin(uTime * 0.8 + phase);
            vAlpha = wave;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv) * 2.0;
            if (d > 1.0) discard;
            float falloff = 1.0 - smoothstep(0.5, 1.0, d);
            gl_FragColor = vec4(uColor * falloff * vAlpha, falloff * vAlpha);
          }
        `}
      />
    </points>
  );
}
