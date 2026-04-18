/* ─────────────────────────────────────────────────────────────────────
 *  SelectionFocus — a 3D halo effect that follows the selected element.
 *
 *  Three nested pieces converge on the anchor point:
 *    1. Three expanding torus rings that pulse outward and fade
 *    2. An inner steady reticle torus with breathing rotation
 *    3. A particle burst triggered on selection change
 *
 *  The effect is white-cream so it reads as a neutral "focus" cue
 *  regardless of the selected element's color, and it sits in front of
 *  the orbiting layers thanks to additive blending.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

interface SelectionFocusProps {
  /** World-space anchor. Null = no selection → nothing renders. */
  anchor: [number, number, number] | null;
  /** Tint color (e.g. the selected element's own color). */
  color?: string;
}

const RING_COUNT = 3;
const RING_PERIOD = 1.8; // seconds for one outward expansion cycle
const BASE_RADIUS = 0.55;
const MAX_RADIUS = 2.1;

export function SelectionFocus({ anchor, color }: SelectionFocusProps) {
  const groupRef = useRef<THREE.Group>(null);
  const reticleRef = useRef<THREE.Mesh>(null);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const particleRef = useRef<THREE.Points>(null);
  const particleMatRef = useRef<THREE.ShaderMaterial>(null);

  // Appear animation: scales the whole group from 0 to 1 on selection.
  const appearRef = useRef(0);
  const prevAnchorRef = useRef<string | null>(null);

  const colorObj = useMemo(() => new THREE.Color(color ?? SCENE.cream), [color]);

  /* Particle burst — ring of tiny points that flare outward when a new
   * selection lands, then fade. The burst resets when the anchor changes. */
  const burstRef = useRef({ t: 999 }); // > any reasonable duration = idle
  const { positions, velocities } = useMemo(() => {
    const N = 32;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1.4 + Math.random() * 0.6;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta) * 0.3;
      const dz = Math.cos(phi);
      pos[i * 3] = dx * 0.2;
      pos[i * 3 + 1] = dy * 0.2;
      pos[i * 3 + 2] = dz * 0.2;
      vel[i * 3] = dx * speed;
      vel[i * 3 + 1] = dy * speed;
      vel[i * 3 + 2] = dz * speed;
    }
    return { positions: pos, velocities: vel };
  }, []);

  const particleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBurstT: { value: 999 },
      uColor: { value: new THREE.Color(SCENE.cream) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    }),
    [],
  );

  // Detect anchor change → retrigger appear + burst.
  useEffect(() => {
    const key = anchor ? anchor.join(",") : null;
    if (key !== prevAnchorRef.current) {
      prevAnchorRef.current = key;
      if (anchor) {
        appearRef.current = 0;
        burstRef.current.t = 0;
      }
    }
  }, [anchor]);

  useFrame((state, delta) => {
    if (!anchor) return;

    // Position the whole group at the anchor.
    if (groupRef.current) {
      groupRef.current.position.set(anchor[0], anchor[1], anchor[2]);
      // Eased appear: 0 → 1 over ~300ms, slight overshoot via easeOutBack.
      appearRef.current = Math.min(1, appearRef.current + delta / 0.3);
      const p = appearRef.current;
      const ease = 1 - Math.pow(1 - p, 3);
      const scaleOvershoot = ease * (1 + 0.18 * (1 - p) * (1 - p));
      groupRef.current.scale.setScalar(scaleOvershoot);
    }

    const t = state.clock.elapsedTime;

    // Expanding rings — each at a different phase of the same period.
    for (let i = 0; i < RING_COUNT; i++) {
      const mesh = ringRefs.current[i];
      const mat = ringMats.current[i];
      if (!mesh || !mat) continue;
      const stagger = (i / RING_COUNT) * RING_PERIOD;
      const phase = (((t + stagger) % RING_PERIOD) / RING_PERIOD);
      // Ease-out radius growth
      const eased = 1 - Math.pow(1 - phase, 2);
      const radius = BASE_RADIUS + eased * (MAX_RADIUS - BASE_RADIUS);
      mesh.scale.setScalar(radius);
      // Opacity: in fast, out linear
      const fadeIn = Math.min(1, phase * 8);
      const fadeOut = 1 - phase;
      mat.opacity = fadeIn * fadeOut * 0.85;
    }

    // Reticle — steady ring that rotates and breathes slightly.
    if (reticleRef.current) {
      reticleRef.current.rotation.z = t * 0.9;
      const breathe = 1 + Math.sin(t * 2.2) * 0.05;
      reticleRef.current.scale.setScalar(breathe);
    }

    // Particle burst — advance timer; material uniform reads it.
    burstRef.current.t += delta;
    if (particleMatRef.current) {
      particleMatRef.current.uniforms.uTime.value = t;
      particleMatRef.current.uniforms.uBurstT.value = burstRef.current.t;
    }
  });

  if (!anchor) return null;

  return (
    <group ref={groupRef}>
      {/* Expanding rings */}
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <mesh
          key={`ring-${i}`}
          ref={(node: THREE.Mesh | null) => {
            ringRefs.current[i] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.98, 1.0, 96]} />
          <meshBasicMaterial
            ref={(mat: THREE.MeshBasicMaterial | null) => {
              ringMats.current[i] = mat;
            }}
            color={colorObj}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Inner reticle — always-on crosshair ring sitting right at the
       *  anchor. Reads as "this is selected" when it's still. */}
      <mesh ref={reticleRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.012, 10, 96]} />
        <meshBasicMaterial
          color={colorObj}
          transparent
          opacity={0.55}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={reticleRef} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.72, 0.012, 10, 96]} />
        <meshBasicMaterial
          color={colorObj}
          transparent
          opacity={0.35}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Particle burst */}
      <points ref={particleRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-velocity"
            args={[velocities, 3]}
            count={velocities.length / 3}
            array={velocities}
            itemSize={3}
          />
        </bufferGeometry>
        <shaderMaterial
          ref={particleMatRef}
          uniforms={particleUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`
            uniform float uTime;
            uniform float uBurstT;
            uniform float uPixelRatio;
            attribute vec3 velocity;
            varying float vAlpha;
            void main() {
              // Burst life: 0 .. 0.9 s
              float life = clamp(uBurstT / 0.9, 0.0, 1.0);
              // Position integrates velocity with heavy drag
              float drag = 1.0 - pow(1.0 - life, 3.0);
              vec3 world = position + velocity * drag * 0.6;
              vec4 mv = modelViewMatrix * vec4(world, 1.0);
              gl_Position = projectionMatrix * mv;
              gl_PointSize = 3.5 * uPixelRatio * (1.0 - life * 0.6) * (12.0 / -mv.z);
              vAlpha = (1.0 - life) * (1.0 - life);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
              vec2 uv = gl_PointCoord - vec2(0.5);
              float d = length(uv) * 2.0;
              if (d > 1.0) discard;
              float falloff = 1.0 - smoothstep(0.3, 1.0, d);
              gl_FragColor = vec4(uColor * falloff * vAlpha, falloff * vAlpha);
            }
          `}
        />
      </points>
    </group>
  );
}
