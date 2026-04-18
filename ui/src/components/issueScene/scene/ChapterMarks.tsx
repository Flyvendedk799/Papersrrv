/* ─────────────────────────────────────────────────────────────────────
 *  ChapterMarks — editorial tick-labels along the time spine.
 *
 *  A tiny vertical tick at each milestone's x-position, plus a
 *  Fragment-Mono-style drei <Text> label floating below the spine.
 *  Labels carry both the chapter name ("FIRST RUN") and a relative
 *  time phrase ("10D AGO"), in the Boared voice.
 *
 *  Labels never bloom — they use outlineWidth so they stay crisp.
 *  The tick marks are cream-dim, so they read as structural scale,
 *  not as protagonists.
 * ───────────────────────────────────────────────────────────────────── */

import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { ChapterMark } from "../data/timelineLayout";
import { SCENE } from "../colors";

interface ChapterMarksProps {
  marks: ChapterMark[];
}

export function ChapterMarks({ marks }: ChapterMarksProps) {
  return (
    <group>
      {marks.map((m) => (
        <ChapterMarkItem key={m.key} mark={m} />
      ))}
    </group>
  );
}

function ChapterMarkItem({ mark }: { mark: ChapterMark }) {
  /* The tick: a short vertical line (cylinder) rising slightly above
   * and below the spine, biased downward so labels sit below it. */
  const tickHeight = 0.34;
  const isNow = mark.key === "now";
  const accent = isNow ? SCENE.acid : SCENE.creamDim;

  return (
    <group position={[mark.x, 0, 0]}>
      {/* Tick */}
      <mesh position={[0, -tickHeight / 2 + 0.04, 0]}>
        <cylinderGeometry args={[0.008, 0.008, tickHeight, 6]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={isNow ? 0.85 : 0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Chapter label — Fragment Mono-ish, uppercase, spaced. */}
      <Text
        position={[0, -0.3, 0]}
        fontSize={0.12}
        color={accent}
        anchorX="center"
        anchorY="top"
        letterSpacing={0.26}
        outlineColor="#000"
        outlineWidth={0.008}
      >
        {mark.label.toUpperCase()}
      </Text>

      {/* Ago phrase — smaller, muted. */}
      <Text
        position={[0, -0.48, 0]}
        fontSize={0.09}
        color={SCENE.creamDim}
        anchorX="center"
        anchorY="top"
        letterSpacing={0.22}
        outlineColor="#000"
        outlineWidth={0.006}
      >
        {mark.agoPhrase.toUpperCase()}
      </Text>
    </group>
  );
}
