/* ─────────────────────────────────────────────────────────────────────
 *  AuroraBackdrop — slow-noise nebula curtain at the back of the scene.
 *
 *  A massive inverted sphere with a fragment shader that paints:
 *    · a radial vignette from the pillar outward
 *    · two layers of slow-moving value-noise, tinted by the atmosphere
 *      mood color so a blocked issue gets warm red clouds, a serene
 *      one gets cool cyan, etc.
 *    · per-pixel slow dimming near the horizon so the floor disappears
 *
 *  Sits far enough out to be behind StarFlecks (~r=70). Because it's
 *  inside-out, it appears as a domed backdrop no matter where the
 *  camera looks.
 *
 *  Fragment-shader only; near-zero CPU cost. GPU cost is one
 *  fullscreen-equivalent fragment pass scaled to however much of the
 *  sphere is in view.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface AuroraBackdropProps {
  /** Base hex color of the mood atmosphere (urgent→warm, serene→cool).
   *  The shader mixes this with the scene bg for the noise clouds. */
  moodColor: string;
  /** Mood intensity 0..1 — how much of the colored aurora vs. plain void.
   *  Passing 0 effectively hides the aurora for quiet/neutral issues. */
  intensity?: number;
}

const RADIUS = 85;

export function AuroraBackdrop({ moodColor, intensity = 0.55 }: AuroraBackdropProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMood: { value: new THREE.Color(moodColor) },
      uIntensity: { value: intensity },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Keep color + intensity in sync when atmosphere changes.
  useMemo(() => {
    uniforms.uMood.value.set(moodColor);
    uniforms.uIntensity.value = intensity;
  }, [moodColor, intensity, uniforms]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh frustumCulled={false}>
      {/* Inside-out sphere — render inside faces only. */}
      <sphereGeometry args={[RADIUS, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
        transparent
        vertexShader={`
          varying vec3 vWorldPos;
          varying vec2 vUv;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorldPos = w.xyz;
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uMood;
          uniform float uIntensity;
          varying vec3 vWorldPos;
          varying vec2 vUv;

          /* 2D hash → 1D, Steven Witten-style cheap noise. */
          float hash21(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }

          /* Value noise — 2 octaves, cheap and smooth. */
          float vnoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            v += 0.55 * vnoise(p);
            v += 0.28 * vnoise(p * 2.1 + 5.3);
            v += 0.15 * vnoise(p * 4.3 - 1.1);
            return v;
          }

          void main() {
            /* Remap world y/x to a 2D "sky" coord. Time scrolls the
               clouds horizontally. */
            vec2 p = vec2(
              atan(vWorldPos.z, vWorldPos.x) * 1.2,
              vWorldPos.y * 0.04
            );
            p.x += uTime * 0.012;
            p.y += uTime * 0.004;

            /* Two noise layers — one broad, one tight. */
            float broad = fbm(p * 0.8);
            float tight = fbm(p * 2.3 + vec2(12.0, 0.0));
            float aurora = smoothstep(0.35, 0.95, broad * 0.7 + tight * 0.3);

            /* Radial darken so the center behind the pillar is deeper
               than the edges of the viewport — draws the eye in. */
            vec3 dirFromCenter = normalize(vWorldPos);
            float rad = abs(dirFromCenter.y);
            float horizonDarken = 0.55 + 0.45 * (1.0 - rad);

            /* Base void color = very dark blue-purple. */
            vec3 baseVoid = vec3(0.01, 0.012, 0.022);

            /* Mood color, softened. */
            vec3 cloud = mix(baseVoid, uMood * 0.7, aurora * uIntensity);

            /* Sparse "stardust" specks — higher-frequency noise,
               blown out only at its brightest. */
            float specks = pow(vnoise(p * 40.0 + uTime * 0.05), 20.0);
            vec3 col = cloud * horizonDarken + vec3(specks) * 0.4;

            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}
