/* ─────────────────────────────────────────────────────────────────────
 *  PillarSpindle — a tall, narrow vertical light rod running through
 *  the pillar core.
 *
 *  The original pillar reads as a glowing ORB. A case file's central
 *  "pillar" should be a COLUMN. This component adds:
 *    · a thin bright inner rod (height 5.0, radius 0.06)
 *    · a softer outer cylinder (height 4.2, radius 0.18) with a
 *      vertical emissive scroll shader that hints at flowing energy
 *    · top + bottom "cap" sprites that bloom the ends so the rod
 *      reads as lit from within, not as a solid stick
 *
 *  The whole thing sits dead-center at origin so it punches through
 *  the core icosahedron. Because the core is noise-displaced and
 *  semi-transparent around its edges, the spindle reads as the
 *  pillar's "spine."
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface PillarSpindleProps {
  /** Status hex — drives the tint. */
  color: string;
  /** 0..1 — live activity, brightens + speeds scroll. */
  livePulse: number;
}

const TOTAL_HEIGHT = 5.0;
const ROD_RADIUS = 0.055;
const SHEATH_RADIUS = 0.2;

export function PillarSpindle({ color, livePulse }: PillarSpindleProps) {
  const sheathMatRef = useRef<THREE.ShaderMaterial>(null);
  const rodRef = useRef<THREE.Mesh>(null);
  const topCapRef = useRef<THREE.Mesh>(null);
  const bottomCapRef = useRef<THREE.Mesh>(null);

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
    const t = state.clock.elapsedTime;
    if (sheathMatRef.current) {
      sheathMatRef.current.uniforms.uTime.value = t;
    }
    /* Subtle breathing on the inner rod to match the pillar core. */
    if (rodRef.current) {
      const s = 1 + Math.sin(t * 1.57) * 0.06 + Math.sin(t * 5.2) * 0.08 * livePulse;
      rodRef.current.scale.y = s;
    }
    /* Top + bottom caps pulse gently to look like emission points. */
    if (topCapRef.current || bottomCapRef.current) {
      const s = 1 + Math.sin(t * 2.1) * 0.12 + livePulse * 0.15 * Math.sin(t * 5.2);
      if (topCapRef.current) topCapRef.current.scale.setScalar(s);
      if (bottomCapRef.current) bottomCapRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      {/* Bright inner rod — the "spine" the pillar is built around. */}
      <mesh ref={rodRef}>
        <cylinderGeometry args={[ROD_RADIUS, ROD_RADIUS, TOTAL_HEIGHT, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Softer sheath with a vertical emissive scroll — sells "flowing
          energy inside a glass rod" without the cost of real glass. */}
      <mesh>
        <cylinderGeometry args={[SHEATH_RADIUS, SHEATH_RADIUS, TOTAL_HEIGHT * 0.88, 20, 1, true]} />
        <shaderMaterial
          ref={sheathMatRef}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
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

            float hash11(float x) {
              return fract(sin(x * 43.23) * 91.15);
            }

            void main() {
              /* Radial soft edge — brightest at the VERTICAL center
                 of the cylinder surface. */
              float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
              radial = pow(max(radial, 0.0), 1.6);

              /* Vertical bands scrolling upward. Faster with livePulse. */
              float speed = 0.45 + uLive * 0.9;
              float bands = sin((vUv.y * 16.0) - uTime * speed);
              bands = smoothstep(0.5, 1.0, bands) * 0.9 + 0.2;

              /* Soft end-fade so the rod doesn't abruptly terminate. */
              float endFade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);

              float alpha = radial * bands * endFade * 0.55;
              gl_FragColor = vec4(uColor * (1.0 + uLive * 0.5), alpha);
            }
          `}
        />
      </mesh>

      {/* Top emission cap — a small sprite-like disc at the top of
          the rod. */}
      <mesh ref={topCapRef} position={[0, TOTAL_HEIGHT * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bottom emission cap — slightly smaller, same idea. */}
      <mesh ref={bottomCapRef} position={[0, -TOTAL_HEIGHT * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.26, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
