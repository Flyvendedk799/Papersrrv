/* ─────────────────────────────────────────────────────────────────────
 *  MentionArcs — thin 3D arcs connecting comments to the subtasks
 *  they reference by identifier.
 *
 *  Why this exists:
 *    The comment orbit (radius ~7.2, y=1.5) and the descendant fan
 *    (radius ~4.2, y=-1.7) each look beautiful independently — but the
 *    relationship between them is invisible. An engineer looking at
 *    "PAP-234" in a comment body reads it as a pointer to PAP-234.
 *    We should render that pointer.
 *
 *  Visual grammar:
 *    · Smooth cubic bezier arc, sags toward the pillar so arcs from
 *      different comments don't cross in a mess.
 *    · Additive blending, low alpha. Glows with Bloom but doesn't
 *      dominate.
 *    · A small bright sprite at the descendant end pulses gently to
 *      draw the eye toward the target. No pulse at the comment end
 *      because that's already the node the user was looking at.
 *
 *  Performance:
 *    · Capped at narrative.mentionLinks.length (already ≤ 12).
 *    · One tube per arc, low segment count. Shared material.
 *    · No per-frame geometry rebuild — arcs only regenerate when the
 *      links array changes.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { NarrativeMentionLink } from "./narrative";

interface MentionArcsProps {
  links: NarrativeMentionLink[];
}

// Match the existing scene anchors.
const COMMENT_RADIUS = 7.2;
const COMMENT_Y = 1.5;
const DESCENDANT_RADIUS = 4.2;
const DESCENDANT_Y = -1.7;

/** Build a cubic bezier curve that sags toward the pillar so multiple
 *  arcs have a consistent "tucked" shape rather than chaotic straight
 *  lines. Returns positions sampled at N segments + 1. */
function buildArc(
  commentAngle: number,
  descendantAngle: number,
  segments: number,
): Float32Array {
  const cx = Math.cos(commentAngle) * COMMENT_RADIUS;
  const cz = Math.sin(commentAngle) * COMMENT_RADIUS;
  const dx = Math.cos(descendantAngle) * DESCENDANT_RADIUS;
  const dz = Math.sin(descendantAngle) * DESCENDANT_RADIUS;

  const start = new THREE.Vector3(cx, COMMENT_Y, cz);
  const end = new THREE.Vector3(dx, DESCENDANT_Y, dz);

  // Sag toward the pillar (origin x/z) so arcs converge visually.
  const midDirX = (cx + dx) * 0.5 * 0.35;
  const midDirZ = (cz + dz) * 0.5 * 0.35;
  const ctrl1 = new THREE.Vector3(midDirX, COMMENT_Y - 0.8, midDirZ);
  const ctrl2 = new THREE.Vector3(midDirX, DESCENDANT_Y + 1.6, midDirZ);

  const curve = new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
  const out = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const p = curve.getPoint(i / segments);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

export function MentionArcs({ links }: MentionArcsProps) {
  if (links.length === 0) return null;
  return (
    <>
      {links.map((l) => (
        <SingleArc key={l.key} link={l} />
      ))}
    </>
  );
}

function SingleArc({ link }: { link: NarrativeMentionLink }) {
  const SEGMENTS = 28;
  const positions = useMemo(
    () => buildArc(link.commentAngle, link.descendantAngle, SEGMENTS),
    [link.commentAngle, link.descendantAngle],
  );

  // Endpoint sprite that gently pulses at the descendant end.
  const spriteRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!spriteRef.current) return;
    const t = state.clock.elapsedTime;
    const s = 0.85 + 0.22 * Math.sin(t * 1.8 + link.commentAngle * 4);
    spriteRef.current.scale.setScalar(s);
  });

  const endX = Math.cos(link.descendantAngle) * DESCENDANT_RADIUS;
  const endZ = Math.sin(link.descendantAngle) * DESCENDANT_RADIUS;

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#9BA9FF"
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </line>
      {/* Target sprite — small bright dot that breathes. */}
      <mesh ref={spriteRef} position={[endX, DESCENDANT_Y + 0.08, endZ]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial
          color="#B8C2FF"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
