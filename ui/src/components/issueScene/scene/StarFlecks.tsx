/* ─────────────────────────────────────────────────────────────────────
 *  StarFlecks — deep-background pinpoint stars for depth parallax.
 *
 *  Sits WAY past the substrate (radius ~45–70) so when the camera orbits
 *  the main scene, these distant points shift slightly. This parallax
 *  layer is what sells depth even more than lighting — the eye reads
 *  the scale of the scene by how far the background has to travel.
 *
 *  Small count (~900), tiny size, subtle per-vertex twinkle.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const STAR_COUNT = 900;
const RADIUS_MIN = 45;
const RADIUS_MAX = 70;

interface StarFlecksProps {
  /** Dim to ~50% when true (hover focus mode). */
  dim?: boolean;
}

export function StarFlecks({ dim = false }: StarFlecksProps = {}) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, phases, sizes } = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const ph = new Float32Array(STAR_COUNT);
    const sz = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform on a sphere shell, slightly flattened on Y.
      const r = RADIUS_MIN + Math.random() * (RADIUS_MAX - RADIUS_MIN);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.7;
      pos[i * 3 + 2] = Math.cos(phi) * r;
      ph[i] = Math.random() * Math.PI * 2;
      // Power-law size — most are small, a few are bright.
      sz[i] = Math.pow(Math.random(), 3.2) * 1.5 + 0.4;
    }
    return { positions: pos, phases: ph, sizes: sz };
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
      uOpacityMult: { value: 1 },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      const want = dim ? 0.5 : 1.0;
      const cur = matRef.current.uniforms.uOpacityMult.value;
      matRef.current.uniforms.uOpacityMult.value =
        cur + (want - cur) * Math.min(1, delta * 5);
    }
    // Very slow global rotation — much slower than the substrate so the
    // parallax feels like the camera is moving through space.
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.005;
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={STAR_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-phase"
          args={[phases, 1]}
          count={STAR_COUNT}
          array={phases}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-starsize"
          args={[sizes, 1]}
          count={STAR_COUNT}
          array={sizes}
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
          attribute float phase;
          attribute float starsize;
          varying float vTwinkle;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = starsize * 2.0 * uPixelRatio;
            vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + phase * 0.3) + phase * 6.2);
          }
        `}
        fragmentShader={`
          uniform float uOpacityMult;
          varying float vTwinkle;
          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv) * 2.0;
            if (d > 1.0) discard;
            float core = pow(1.0 - d, 1.5);
            vec3 col = vec3(0.92, 0.96, 1.0);
            float a = core * vTwinkle * uOpacityMult;
            gl_FragColor = vec4(col * a, a * 0.95);
          }
        `}
      />
    </points>
  );
}
