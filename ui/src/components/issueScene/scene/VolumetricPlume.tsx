/* ─────────────────────────────────────────────────────────────────────
 *  VolumetricPlume — a tall column of scrolling energy rising from
 *  the pillar.
 *
 *  A cylinder whose fragment shader paints:
 *    · vertical soft-edge mask (bright near the pillar, fading up)
 *    · scrolling value-noise for texture
 *    · radial soft-edge mask (brightest at the center, fading to rim)
 *    · status-color tint
 *
 *  Additive-blended, depthWrite off. The result looks like rising hot
 *  gas — without any actual physics. Amp scales with `livePulse` so
 *  live runs noticeably ramp up the column.
 *
 *  Positioned just above the pillar core, reaching up toward the
 *  ancestor ring stack. Sits at y ~ 0..8.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface VolumetricPlumeProps {
  /** Status color — drives the tint. */
  color: string;
  /** 0..1 — live activity multiplier; speeds scrolling + brightens. */
  livePulse: number;
}

export function VolumetricPlume({ color, livePulse }: VolumetricPlumeProps) {
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

  // Keep uniforms synced.
  useMemo(() => {
    uniforms.uColor.value.set(color);
    uniforms.uLive.value = livePulse;
  }, [color, livePulse, uniforms]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  // The cylinder is wider at the base (r=0.6) than the top (r=0.3) via
  // cylinderGeometry's taper argument. Height = 8. Centered at y=4 so
  // the base sits at pillar-top (y=0) and the tip reaches y=8.
  return (
    <mesh position={[0, 4, 0]} frustumCulled={false}>
      <cylinderGeometry args={[0.3, 0.6, 8, 24, 8, true]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        toneMapped={false}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vLocalPos;
          void main() {
            vUv = uv;
            vLocalPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uLive;
          varying vec2 vUv;
          varying vec3 vLocalPos;

          /* Cheap 2D hash and value noise. */
          float hash21(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }
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
            /* vUv.y: 0 at bottom, 1 at top. */
            float yNorm = vUv.y;

            /* Vertical fade — bright at base, gone at top. */
            float vertMask = pow(1.0 - yNorm, 1.6);

            /* Radial fade — brightest at center of the cylinder surface
               (i.e. vUv.x = 0.5). */
            float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
            radial = pow(max(radial, 0.0), 1.4);

            /* Scrolling noise — moves upward faster with live activity. */
            float scroll = uTime * (0.25 + uLive * 0.6);
            vec2 np = vec2(vUv.x * 4.0, vUv.y * 3.5 - scroll);
            float n = fbm(np);

            /* Brightness composite — deliberately low so the plume
               reads as a wisp behind the pillar, NOT a wall competing
               with the centerpiece. */
            float alpha = vertMask * radial * (0.15 + n * 0.35);
            alpha *= 0.6 + uLive * 0.3;

            /* Color gradient — brighter near base, cooler at top. */
            vec3 hot = uColor * (0.9 + uLive * 0.4);
            vec3 cool = uColor * 0.3;
            vec3 col = mix(hot, cool, yNorm);

            gl_FragColor = vec4(col * alpha, alpha * 0.55);
          }
        `}
      />
    </mesh>
  );
}
