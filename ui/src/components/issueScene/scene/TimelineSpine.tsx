/* ─────────────────────────────────────────────────────────────────────
 *  TimelineSpine — the horizontal tube that anchors the case timeline.
 *
 *  Runs along y=0 from (0,0,0) (NOW, at the pillar) to (-length, 0, 0)
 *  (OPENED, in the fog). The fragment shader fades the far end toward
 *  transparent so the past disappears gracefully.
 *
 *  Two small sprite caps mark the endpoints:
 *    · NOW cap — a soft glowing disc where the spine docks into the
 *      pillar. Subtly pulses.
 *    · OPENED cap — a dimmer disc at the far end.
 *
 *  The spine is structural, not a protagonist — cream-tinted, low
 *  opacity, never blooms.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

interface TimelineSpineProps {
  /** Positive length of the spine (extends leftward from origin). */
  length: number;
}

export function TimelineSpine({ length }: TimelineSpineProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const nowCapRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLength: { value: length },
      uColor: { value: new THREE.Color(SCENE.cream) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useMemo(() => {
    uniforms.uLength.value = length;
  }, [length, uniforms]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (nowCapRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 1.8) * 0.15;
      nowCapRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      {/* The spine itself — a thin cylinder rotated to lie along X.
          Centered halfway between 0 and -length. */}
      <mesh
        position={[-length / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.018, 0.018, length, 16, 1, true]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
          vertexShader={`
            uniform float uLength;
            varying float vAlongX;
            void main() {
              /* The local y axis of this rotated cylinder IS the world x
                 axis of the spine. Map local y to [0,1]. */
              vAlongX = (position.y / uLength) + 0.5;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform float uLength;
            uniform vec3 uColor;
            varying float vAlongX;
            void main() {
              /* vAlongX: 0 = OPENED end, 1 = NOW end. Fade the past
                 toward transparent; brighten the NOW end. */
              float past = smoothstep(0.0, 0.25, vAlongX);
              float now = smoothstep(0.85, 1.0, vAlongX);
              float base = past * 0.55 + now * 0.6;
              /* Very slow breath along the spine — a traveling gradient
                 so the spine reads "alive" without strobing. */
              float breath = 0.9 + 0.1 * sin(uTime * 0.6 - vAlongX * 2.5);
              gl_FragColor = vec4(uColor * breath, base);
            }
          `}
        />
      </mesh>

      {/* NOW cap — bright pulsing disc at the pillar end */}
      <mesh
        ref={nowCapRef}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.18, 24]} />
        <meshBasicMaterial
          color={SCENE.cream}
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* OPENED cap — dimmer disc at the far end */}
      <mesh
        position={[-length, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.09, 20]} />
        <meshBasicMaterial
          color={SCENE.creamDim}
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
