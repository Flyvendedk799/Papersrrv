/* ─────────────────────────────────────────────────────────────────────
 *  CameraChoreographer — lerps the camera + controls target to a
 *  named pose from cinematography.ts.
 *
 *  Lives INSIDE <Canvas>. Reads an external `targetPose` prop (driven
 *  by IssueScene's consumer via useScrollChoreography / TourPlayer).
 *
 *  Behaviour:
 *    · On targetPose change, capture the current {position, target,
 *      fov} and lerp to the new pose over DURATION ms using
 *      easeOutCubic.
 *    · If the user drags OrbitControls mid-lerp (detected via the
 *      `start` event), YIELD — stop animating and leave control with
 *      the user. Same yield pattern the existing CameraDolly uses.
 *    · Respects `prefers-reduced-motion`: when set, snap rather than
 *      lerp. The scroll-choreography hook also chooses not to emit
 *      poses at all in reduced-motion, so this is a second line of
 *      defence.
 *
 *  No-op when targetPose is null — the component exists but doesn't
 *  touch the camera. This is the Cut-1-compatible default.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { poseFor, type CameraPose, type CameraPoseKey } from "./cinematography";

interface CameraChoreographerProps {
  /** Pose key to lerp to. Null means "do nothing". Setting it to the
   *  same key twice is idempotent (won't restart a completed lerp). */
  targetPose: CameraPoseKey | null;
  /** Ad-hoc pose — wins over `targetPose` when non-null. Used to fly
   *  the camera to a specific world position (e.g. a clicked node)
   *  rather than one of the canonical named poses. Change-detected by
   *  value equality of position/target/fov so React callers can pass
   *  a fresh object each render without retriggering lerps. */
  customPose?: CameraPose | null;
  /** Reference to the drei <OrbitControls>. Needed because we lerp the
   *  controls target alongside the camera position. */
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Animation duration in milliseconds. Default 900. */
  durationMs?: number;
}

interface AnimState {
  /** Timestamp (ms) when the lerp started. */
  startedAt: number;
  /** Snapshot of the camera at lerp start. */
  startPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  startFov: number;
  /** Destination pose. */
  endPos: THREE.Vector3;
  endTarget: THREE.Vector3;
  endFov: number;
  /** Total duration for this lerp. */
  durationMs: number;
}

/** Stable-string key for a custom pose so we don't re-trigger a lerp
 *  when the caller passes an object with the same values. */
function customPoseKey(p: CameraPose): string {
  return `${p.position.join(",")}|${p.target.join(",")}|${p.fov}`;
}

export function CameraChoreographer({
  targetPose,
  customPose,
  controlsRef,
  durationMs = 900,
}: CameraChoreographerProps) {
  const { camera } = useThree();
  const animRef = useRef<AnimState | null>(null);
  const lastPoseRef = useRef<CameraPoseKey | null>(null);
  const lastCustomKeyRef = useRef<string | null>(null);
  const reducedMotionRef = useRef(false);

  /* Honour prefers-reduced-motion. Cache on mount; the media query is
   * also a live listener so user changes mid-session are honoured. */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* Custom pose takes precedence when non-null. Used for "click a node
   * → camera flies to fit that specific world position" — the focus
   * pose is derived from the clicked node's spherePos, not one of the
   * canonical named poses. */
  useEffect(() => {
    if (!customPose) {
      lastCustomKeyRef.current = null;
      return;
    }
    const key = customPoseKey(customPose);
    if (key === lastCustomKeyRef.current) return;

    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const endPos = new THREE.Vector3(...customPose.position);
    const endTarget = new THREE.Vector3(...customPose.target);

    if (reducedMotionRef.current) {
      camera.position.copy(endPos);
      ctrl.target.copy(endTarget);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).fov = customPose.fov;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
      ctrl.update();
      lastCustomKeyRef.current = key;
      animRef.current = null;
      return;
    }

    animRef.current = {
      startedAt: performance.now(),
      startPos: camera.position.clone(),
      startTarget: ctrl.target.clone(),
      startFov: (camera as THREE.PerspectiveCamera).fov ?? customPose.fov,
      endPos,
      endTarget,
      endFov: customPose.fov,
      durationMs,
    };
    lastCustomKeyRef.current = key;
    /* Clear the named-pose cache so a subsequent targetPose set to the
     * same key still retriggers (since we just overrode the camera). */
    lastPoseRef.current = null;
  }, [customPose, controlsRef, camera, durationMs]);

  /* When targetPose changes, start a new lerp — unless it's the same
   * as the last completed one, in which case don't bother. Named pose
   * defers to a live custom pose (custom wins). */
  useEffect(() => {
    if (customPose) return;
    if (targetPose === null) return;
    if (targetPose === lastPoseRef.current) return;

    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const pose = poseFor(targetPose);
    const endPos = new THREE.Vector3(...pose.position);
    const endTarget = new THREE.Vector3(...pose.target);

    /* Reduced-motion: snap instantly rather than animate. */
    if (reducedMotionRef.current) {
      camera.position.copy(endPos);
      ctrl.target.copy(endTarget);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).fov = pose.fov;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
      ctrl.update();
      lastPoseRef.current = targetPose;
      animRef.current = null;
      return;
    }

    animRef.current = {
      startedAt: performance.now(),
      startPos: camera.position.clone(),
      startTarget: ctrl.target.clone(),
      startFov: (camera as THREE.PerspectiveCamera).fov ?? pose.fov,
      endPos,
      endTarget,
      endFov: pose.fov,
      durationMs,
    };
    lastPoseRef.current = targetPose;
  }, [targetPose, customPose, controlsRef, camera, durationMs]);

  /* Yield control to the user if they start dragging the OrbitControls.
   * We listen for the 'start' event on the controls. */
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const onStart = () => {
      animRef.current = null;
    };
    // three-stdlib's OrbitControls extends EventDispatcher; addEventListener
    // is the documented API but it's typed loosely.
    const anyCtrl = ctrl as unknown as {
      addEventListener: (t: string, cb: () => void) => void;
      removeEventListener: (t: string, cb: () => void) => void;
    };
    anyCtrl.addEventListener?.("start", onStart);
    return () => anyCtrl.removeEventListener?.("start", onStart);
  }, [controlsRef]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const raw = Math.min(
      1,
      (performance.now() - anim.startedAt) / anim.durationMs,
    );
    /* easeOutCubic — fast then gentle, feels "landed" rather than
     * arriving at constant speed. */
    const t = 1 - Math.pow(1 - raw, 3);

    camera.position.lerpVectors(anim.startPos, anim.endPos, t);
    ctrl.target.lerpVectors(anim.startTarget, anim.endTarget, t);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const fov = anim.startFov + (anim.endFov - anim.startFov) * t;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    }

    ctrl.update();

    if (raw >= 1) {
      animRef.current = null;
    }
  });

  return null;
}
