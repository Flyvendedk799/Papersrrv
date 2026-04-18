/* ─────────────────────────────────────────────────────────────────────
 *  cinematography — named camera poses for the issue scene.
 *
 *  Each pose frames a different "act" of the scene so the
 *  CameraChoreographer can lerp the camera + controls target between
 *  them as the user scrolls the case file (or plays the guided tour).
 *
 *  Poses are tuned against the existing scene scales in IssueScene.tsx:
 *    · Pillar at origin, height ~4
 *    · Run orbit radius ~5.5, y ~ 1
 *    · Comment orbit radius ~7.2, y ~ 1.5
 *    · Ancestor rings rising to y ~ 8
 *    · Descendant fan at y ~ -2.4, radius ~ 4.2
 *    · Approval portals at y ~ 4, z ~ 0
 *    · Default camera is [6, 4.5, 18], target [0, 0, 0], fov 42
 *
 *  Pure data — this module MUST have no three.js imports because it's
 *  pulled into the DOM overlay modules (CompanionChapters). The
 *  CameraChoreographer converts these tuples into THREE.Vector3s at use.
 * ───────────────────────────────────────────────────────────────────── */

export type CameraPoseKey =
  | "OVERVIEW"
  | "ANCESTORS"
  | "RUNS"
  | "COMMENTS"
  | "DESCENDANTS"
  | "APPROVALS"
  | "NOW";

export interface CameraPose {
  /** [x, y, z] — camera position in world units. */
  position: [number, number, number];
  /** [x, y, z] — OrbitControls target (the point the camera looks at). */
  target: [number, number, number];
  /** Perspective FOV in degrees. Wider = more of the scene in frame. */
  fov: number;
}

/* Hand-tuned so each pose "tells" its part of the story:
 *
 *   OVERVIEW     — the familiar arrival framing, slightly elevated
 *   ANCESTORS    — camera rises, looks up at parent rings
 *   RUNS         — skims the run orbit, just above it
 *   COMMENTS     — counter-angle so comments aren't occluded by pillar
 *   DESCENDANTS  — descends and tilts down over the subtask fan
 *   APPROVALS    — looks up at the approval portals above the pillar
 *   NOW          — neutral "end of tour" pose, same as overview
 */
export const CAMERA_POSES: Record<CameraPoseKey, CameraPose> = {
  OVERVIEW: {
    position: [6, 4.5, 18],
    target: [0, 0, 0],
    fov: 42,
  },
  ANCESTORS: {
    position: [2, 9, 14],
    target: [0, 3.5, 0],
    fov: 40,
  },
  RUNS: {
    position: [11, 2.2, 11],
    target: [0, 1, 0],
    fov: 36,
  },
  COMMENTS: {
    position: [-11, 3, 11],
    target: [0, 1.8, 0],
    fov: 36,
  },
  DESCENDANTS: {
    position: [0, -2.6, 12],
    target: [0, -1.8, 0],
    fov: 40,
  },
  APPROVALS: {
    position: [0, 9.5, 7],
    target: [0, 4.5, 0],
    fov: 36,
  },
  NOW: {
    position: [6, 4.5, 18],
    target: [0, 0, 0],
    fov: 42,
  },
};

/** Look up a pose by key, with graceful fallback to OVERVIEW. */
export function poseFor(key: CameraPoseKey): CameraPose {
  return CAMERA_POSES[key] ?? CAMERA_POSES.OVERVIEW;
}

/**
 * Map a SceneTarget to the canonical camera pose key that frames it.
 * Used by the "click a below-fold row → camera flies to the matching
 * 3D node" flow. Kept in this module so the data-flow stays:
 *   target → poseKey → pose → CameraChoreographer
 */
import type { SceneTarget } from "../data/types";

export function poseForTarget(target: SceneTarget): CameraPoseKey {
  switch (target.kind) {
    case "issue":
      return "OVERVIEW";
    case "ancestor":
      return "ANCESTORS";
    case "descendant":
      return "DESCENDANTS";
    case "run":
      return "RUNS";
    case "comment":
    case "event":
      return "COMMENTS";
    case "approval":
      return "APPROVALS";
  }
}
