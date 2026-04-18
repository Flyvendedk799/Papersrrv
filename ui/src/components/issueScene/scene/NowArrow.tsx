/* ─────────────────────────────────────────────────────────────────────
 *  NowArrow — a thin cream tick at φ=0 of the run-ring equator.
 *
 *  Signals "time origin is here" so that the user can read the sphere
 *  as a clock: everything counter-clockwise from this tick happened
 *  before NOW, older the further around.
 * ───────────────────────────────────────────────────────────────────── */

import { Line } from "@react-three/drei";
import { SCENE } from "../colors";
import { LAYOUT } from "../data/layout";

export function NowArrow() {
  const r = LAYOUT.RUN_RADIUS;
  const rOut = LAYOUT.COMMENT_RADIUS + 0.4;

  return (
    <group>
      {/* Vertical tick crossing both shells at φ=0 */}
      <Line
        points={[
          [r - 0.15, 0.0, 0],
          [rOut + 0.3, 0.0, 0],
        ]}
        color={SCENE.cream}
        lineWidth={0.02}
        transparent
        opacity={0.55}
      />
      {/* Small head mark */}
      <Line
        points={[
          [rOut + 0.15, 0.12, 0],
          [rOut + 0.3, 0.0, 0],
          [rOut + 0.15, -0.12, 0],
        ]}
        color={SCENE.cream}
        lineWidth={0.02}
        transparent
        opacity={0.55}
      />
    </group>
  );
}
