import { useCallback } from "react";
import { usePapeeOptional } from "../context/PapeeContext";
import { usePapeeTargetRegistryOptional } from "../context/PapeeTargetRegistry";

const PAPEE_SIZE = { width: 56, height: 72 };
const MIN_DISTANCE = 80; // px to stay from target

/**
 * Provides high-level Papee actions: pointAt, lookAt, walkTo.
 */
export function usePapeePointing() {
  const papee = usePapeeOptional();
  const registry = usePapeeTargetRegistryOptional();

  /**
   * Walk Papee to a position adjacent to the target element.
   * Chooses the side (left/right) with more viewport space.
   */
  const walkTo = useCallback((targetId: string) => {
    if (!papee || !registry) return false;
    const target = registry.getTarget(targetId);
    if (!target || !target.visible) return false;

    const rect = target.rect;
    const viewportWidth = window.innerWidth;
    const spaceLeft = rect.left;
    const spaceRight = viewportWidth - rect.right;

    // Choose the side with more room
    let newX: number;
    if (spaceRight > spaceLeft) {
      newX = Math.min(rect.right + MIN_DISTANCE, viewportWidth - PAPEE_SIZE.width - 16);
    } else {
      newX = Math.max(rect.left - MIN_DISTANCE - PAPEE_SIZE.width, 16);
    }
    // Vertically center on target, clamped to viewport
    let newY = rect.top + rect.height / 2 - PAPEE_SIZE.height / 2;
    newY = Math.max(16, Math.min(newY, window.innerHeight - PAPEE_SIZE.height - 16));

    papee.setTargetPosition({ x: newX, y: newY });
    return true;
  }, [papee, registry]);

  /**
   * Point at a target: walk to it AND trigger pointing animation.
   * Uses highlight overlay (Phase 4) by setting highlightTarget in context.
   */
  const pointAt = useCallback((targetId: string) => {
    if (!papee || !registry) return false;
    const didWalk = walkTo(targetId);
    if (!didWalk) return false;

    // Determine which direction to point based on target position relative to Papee
    const target = registry.getTarget(targetId);
    if (!target) return false;

    const targetCenterX = target.rect.left + target.rect.width / 2;
    const papeeCenterX = (papee.position?.x ?? 0) + PAPEE_SIZE.width / 2;
    const pointingState: "pointing-left" | "pointing-right" =
      targetCenterX < papeeCenterX ? "pointing-left" : "pointing-right";

    // Queue pointing animation (pose to be added to PapeeSprites)
    papee.queueReaction(pointingState, 3000);

    // If setHighlightTarget exists on context (Phase 4), use it
    if ("setHighlightTarget" in papee && typeof (papee as unknown as { setHighlightTarget?: unknown }).setHighlightTarget === "function") {
      (papee as unknown as { setHighlightTarget: (id: string) => void }).setHighlightTarget(targetId);
    }

    return true;
  }, [papee, registry, walkTo]);

  /**
   * Just shift gaze toward target without moving.
   * Target coordinate resolution handled by gaze hook via context (or via a setGazeTarget in context).
   */
  const lookAt = useCallback((targetId: string) => {
    if (!registry) return false;
    const target = registry.getTarget(targetId);
    if (!target || !target.visible) return false;
    // The gaze hook reads from a shared setGazeTarget — for now, expose coordinates
    // via a custom event that the gaze hook can listen to. Alternatively, the behavior
    // loop (Phase 6) will call setGazeTarget from usePapeeGaze directly.
    const cx = target.rect.left + target.rect.width / 2;
    const cy = target.rect.top + target.rect.height / 2;
    window.dispatchEvent(new CustomEvent("papee:look-at", { detail: { x: cx, y: cy } }));
    return true;
  }, [registry]);

  return { pointAt, lookAt, walkTo };
}
