/* ─────────────────────────────────────────────────────────────────────
 *  HoverFocus — a thin, lightweight ring marker that follows the
 *  currently-hovered node.
 *
 *  Deliberately simpler than SelectionFocus:
 *    · No particle burst (selection owns the big reward moment)
 *    · Just one thin ring + a faint aura sprite
 *    · Appears and follows the hover anchor smoothly
 *    · Fades when hover is cleared
 *
 *  Wayfinding aid. The viewer sees a tiny cream halo where their
 *  cursor lands in 3D space, which makes the eye → pointer connection
 *  explicit (important in a scene with lots of orbiting bodies).
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENE } from "../colors";

interface HoverFocusProps {
  anchor: [number, number, number] | null;
  color?: string;
}

export function HoverFocus({ anchor, color }: HoverFocusProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.Mesh>(null);

  // Smoothed visibility — 0..1 — lerps toward 1 on hover, 0 on clear.
  const visRef = useRef(0);

  // Target position — lerped each frame so the ring "flies" to the new
  // hover point instead of teleporting.
  const targetPos = useRef(new THREE.Vector3());
  const smoothedPos = useRef(new THREE.Vector3());
  const hasTargetRef = useRef(false);

  useEffect(() => {
    if (anchor) {
      targetPos.current.set(anchor[0], anchor[1], anchor[2]);
      if (!hasTargetRef.current) {
        smoothedPos.current.copy(targetPos.current);
      }
      hasTargetRef.current = true;
    } else {
      hasTargetRef.current = false;
    }
  }, [anchor]);

  const colorObj = useMemo(
    () => new THREE.Color(color ?? SCENE.cream),
    [color],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    /* Visibility lerp. */
    const wantVis = hasTargetRef.current ? 1 : 0;
    visRef.current += (wantVis - visRef.current) * Math.min(1, delta * 9);
    const v = visRef.current;
    if (v < 0.001) {
      group.visible = false;
      return;
    }
    group.visible = true;

    /* Position lerp — only when there's a current anchor. */
    if (hasTargetRef.current) {
      smoothedPos.current.lerp(targetPos.current, Math.min(1, delta * 14));
    }
    group.position.copy(smoothedPos.current);

    /* Ring breathing — thin, fast. */
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 3.2) * 0.06;
      ringRef.current.scale.setScalar(s * v);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 * v;
    }

    /* Aura sprite — softer, counter-phase. */
    if (auraRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 2.1 + 1.0) * 0.1;
      auraRef.current.scale.setScalar(s * v);
      const mat = auraRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 * v;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Thin ring — billboarded (faces camera via rotation[X]=PI/2). */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.018, 10, 64]} />
        <meshBasicMaterial
          color={colorObj}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>

      {/* Softer outer aura — billboard disc. */}
      <mesh ref={auraRef} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial
          color={colorObj}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
