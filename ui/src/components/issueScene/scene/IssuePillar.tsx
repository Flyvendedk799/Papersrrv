/* ─────────────────────────────────────────────────────────────────────
 *  IssuePillar — the central luminous shard
 *
 *  The core of the scene. A vertical shard with:
 *    · an emissive inner core glowing in the issue's status color
 *    · a glass-like translucent outer shell
 *    · a slow breath that speeds up with livePulse
 *    · floating 3D text beside it showing identifier + title
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { Issue } from "@paperclipai/shared";
import { SCENE, statusColor, statusShellColor, priorityAmplitude } from "../colors";

interface IssuePillarProps {
  issue: Issue;
  livePulse: number; // 0..1
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
}

export function IssuePillar({ issue, livePulse, onHover, onClick }: IssuePillarProps) {
  const core = statusColor(issue.status);
  const shell = statusShellColor(issue.status);
  const amp = priorityAmplitude(issue.priority);

  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  // Color objects created once — not per frame.
  const coreColor = useMemo(() => new THREE.Color(core), [core]);
  const shellColor = useMemo(() => new THREE.Color(shell), [shell]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Slow base breath (4s period) + faster pulse tied to livePulse (1.2s period)
    const base = 1 + Math.sin(t * 1.57) * 0.04; // ~4s
    const live = 1 + Math.sin(t * 5.2) * 0.08 * livePulse;
    const scale = base * live;
    if (innerRef.current) innerRef.current.scale.setScalar(scale);
    if (outerRef.current) outerRef.current.scale.set(1, 1 + Math.sin(t * 0.8) * 0.02, 1);

    // Pulse the glow intensity
    if (glowRef.current) {
      glowRef.current.intensity =
        2 * amp + Math.sin(t * 1.57) * 0.6 * amp + Math.sin(t * 5.2) * 1.1 * livePulse;
    }

    // Halo breath — slow rotation and gentle scale
    if (haloRef.current) {
      haloRef.current.rotation.y = t * 0.3;
      haloRef.current.rotation.x = Math.sin(t * 0.4) * 0.1;
      const haloScale = 1 + Math.sin(t * 1.1) * 0.06;
      haloRef.current.scale.setScalar(haloScale);
    }
  });

  // Identifier label: "§ PAP-234  ·  TD"
  const identifier = issue.identifier ?? issue.id.slice(0, 8);

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover?.(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Emissive inner core — the actual "light source" */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.6, 2]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={2.5 * amp}
          roughness={0.35}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* Halo shell — icosphere wireframe slowly rotating around the core */}
      <mesh ref={haloRef}>
        <icosahedronGeometry args={[1.1, 1]} />
        <meshBasicMaterial
          color={coreColor}
          wireframe
          transparent
          opacity={0.35}
          toneMapped={false}
        />
      </mesh>

      {/* Outer translucent shell — gives depth via refraction-like effect */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[1.7, 2]} />
        <meshPhysicalMaterial
          color={shellColor}
          emissive={shellColor}
          emissiveIntensity={0.4}
          roughness={0.15}
          metalness={0.3}
          transmission={0.85}
          thickness={0.7}
          ior={1.4}
          transparent
          opacity={0.22}
        />
      </mesh>

      {/* Point light from the core — drives bloom post-processing */}
      <pointLight
        ref={glowRef}
        color={coreColor}
        intensity={2.3 * amp}
        distance={28}
        decay={1.4}
      />

      {/* Identifier tag — floats to the right-ish of the pillar */}
      <group position={[2.4, 0.6, 0]}>
        <Text
          fontSize={0.35}
          color={SCENE.cream}
          anchorX="left"
          anchorY="bottom"
          outlineColor="#000"
          outlineWidth={0.01}
          letterSpacing={0.12}
        >
          § {identifier}
        </Text>
      </group>

      {/* Title tag — larger, drops below the identifier */}
      <group position={[2.4, -0.05, 0]}>
        <Text
          fontSize={0.58}
          color={SCENE.cream}
          anchorX="left"
          anchorY="top"
          outlineColor="#000"
          outlineWidth={0.015}
          maxWidth={14}
          lineHeight={1.1}
        >
          {issue.title}
        </Text>
      </group>

      {/* Status + priority code — a small line below the title */}
      <group position={[2.4, -1.2, 0]}>
        <Text
          fontSize={0.24}
          color={core}
          anchorX="left"
          anchorY="top"
          outlineColor="#000"
          outlineWidth={0.008}
          letterSpacing={0.18}
        >
          {issue.status.toUpperCase().replace(/_/g, " ")} · {issue.priority.toUpperCase()}
        </Text>
      </group>
    </group>
  );
}
