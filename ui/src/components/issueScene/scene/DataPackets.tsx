/* ─────────────────────────────────────────────────────────────────────
 *  DataPackets — glowing beads flowing along spoke curves from the
 *  pillar outward to orbit targets.
 *
 *  The scene shows discs and orbs, but nothing was MOVING between
 *  them. This component drops a few bright beads on each spoke so the
 *  eye reads the pillar as actively dispatching work.
 *
 *  Each packet travels from t=0 (pillar shell at the spoke start) to
 *  t=1 (orbit target) then resets. Packets on the same spoke are
 *  phase-offset so they flow like morse code.
 *
 *  Performance:
 *    · Packets are simple sphere meshes with a shared additive material
 *    · `packetsPerSpoke` capped to 3 at source
 *    · Spokes with travelTowardPillar=true reverse direction so
 *      feedback spokes (e.g. approvals raising from pillar) can send
 *      packets inward
 *
 *  The curve shape matches the existing `curvedSpokePoints()` in
 *  Orbits.tsx so packets ride the SAME line the spoke drew.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface PacketSpoke {
  /** Start point in world coords (typically at pillar shell). */
  from: [number, number, number];
  /** End point in world coords (orbit item position). */
  to: [number, number, number];
  /** Packet tint (agent color / status color / etc). */
  color: string;
  /** Stable key. */
  key: string;
  /** 0..1 — multiplier for packet speed + brightness. Live spokes glow
   *  brighter; idle spokes are dim. */
  energy?: number;
  /** If true, packets travel inward (orbit → pillar) instead of outward. */
  reverse?: boolean;
}

interface DataPacketsProps {
  spokes: PacketSpoke[];
  /** Packets per spoke — capped at 3. */
  packetsPerSpoke?: number;
  /** Seconds for one packet to traverse a spoke at energy=1. */
  travelSeconds?: number;
  /** Bead radius. */
  size?: number;
}

/**
 * Build the same curve-shaped bezier the Orbits.tsx spokes draw so
 * packets don't cross through empty air.
 * Control points sag slightly toward origin to create an arc.
 */
function sampleCurve(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  // Mid "sag" target — pull toward origin by 18% horizontally.
  const midX = (from.x + to.x) * 0.5 * 0.82;
  const midZ = (from.z + to.z) * 0.5 * 0.82;
  const midY = (from.y + to.y) * 0.5 - 0.15;
  const mid1 = new THREE.Vector3(
    from.x + (midX - from.x) * 0.5,
    from.y + (midY - from.y) * 0.5,
    from.z + (midZ - from.z) * 0.5,
  );
  const mid2 = new THREE.Vector3(
    midX + (to.x - midX) * 0.5,
    midY + (to.y - midY) * 0.5,
    midZ + (to.z - midZ) * 0.5,
  );
  // Cubic bezier: B(t) = (1-t)^3*P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
  const omt = 1 - t;
  return new THREE.Vector3(
    omt * omt * omt * from.x +
      3 * omt * omt * t * mid1.x +
      3 * omt * t * t * mid2.x +
      t * t * t * to.x,
    omt * omt * omt * from.y +
      3 * omt * omt * t * mid1.y +
      3 * omt * t * t * mid2.y +
      t * t * t * to.y,
    omt * omt * omt * from.z +
      3 * omt * omt * t * mid1.z +
      3 * omt * t * t * mid2.z +
      t * t * t * to.z,
  );
}

export function DataPackets({
  spokes,
  packetsPerSpoke = 1,
  travelSeconds = 3.0,
  size = 0.045,
}: DataPacketsProps) {
  const perSpoke = Math.min(3, Math.max(1, packetsPerSpoke));

  /* Flatten into a list of per-packet descriptors with cached vector
   * endpoints so we're not allocating THREE.Vector3 every frame. */
  const packets = useMemo(() => {
    return spokes.flatMap((sp) => {
      const fromV = new THREE.Vector3(...sp.from);
      const toV = new THREE.Vector3(...sp.to);
      return Array.from({ length: perSpoke }, (_, i) => ({
        key: `${sp.key}#${i}`,
        fromV,
        toV,
        color: sp.color,
        /* Even phase offset across packets on this spoke. */
        phase: i / perSpoke,
        energy: sp.energy ?? 0.6,
        reverse: !!sp.reverse,
      }));
    });
  }, [spokes, perSpoke]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < packets.length; i++) {
      const mesh = groupRef.current.children[i] as THREE.Mesh | undefined;
      if (!mesh) continue;
      const p = packets[i];

      const rawT = ((t / travelSeconds) * (0.75 + p.energy * 0.75) + p.phase) % 1;
      const travelT = p.reverse ? 1 - rawT : rawT;
      const pos = sampleCurve(p.fromV, p.toV, travelT);
      mesh.position.copy(pos);

      // Fade a little at the ends so packets pop in/out cleanly.
      const fade =
        rawT < 0.08
          ? rawT / 0.08
          : rawT > 0.92
            ? (1 - rawT) / 0.08
            : 1;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      // Opacity ceiling kept low so packets read as flow cues, not stars.
      mat.opacity = 0.45 * fade * (0.5 + p.energy * 0.7);
    }
  });

  if (packets.length === 0) return null;

  return (
    <group ref={groupRef} frustumCulled={false}>
      {packets.map((p) => (
        <mesh key={p.key}>
          <sphereGeometry args={[size, 10, 10]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
