/* ─────────────────────────────────────────────────────────────────────
 *  AxisLabels — faint drei text that names the sphere's axes.
 *
 *  ↑ PARENTS   above the pillar
 *  ↓ SUB-MATTERS   below the pillar
 *  NOW →   on the equator at φ=0
 *
 *  All labels are low-opacity cream so they recede when the user isn't
 *  looking for them but are decodable on a deliberate pass.
 * ───────────────────────────────────────────────────────────────────── */

import { Text } from "@react-three/drei";
import { SCENE } from "../colors";
import { LAYOUT } from "../data/layout";

/**
 * AxisLabels now only handles the NOW axis — cluster labels (PARENTS,
 * SUB-MATTERS, RUNS, CORRESPONDENCE, ACTIVITY, APPROVALS) moved to
 * ClusterLabels.tsx so each shell shows its own count.
 */
export function AxisLabels() {
  const labelColor = SCENE.cream;

  return (
    <group>
      {/* NOW arrow sits at the equator, right side (φ=0 in world). */}
      <Text
        position={[LAYOUT.COMMENT_RADIUS + 1.4, 0.2, 0]}
        color={labelColor}
        fontSize={0.42}
        anchorX="left"
        anchorY="middle"
        fillOpacity={0.52}
        letterSpacing={0.22}
      >
        NOW →
      </Text>
    </group>
  );
}
