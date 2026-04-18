/* ─────────────────────────────────────────────────────────────────────
 *  useRowIntegration — one hook per below-fold row, three bridges:
 *
 *    · hover     — set hover store when mouse enters; clear on leave.
 *                  Scene reads the store per frame (no React re-render).
 *                  Row reads its own hover status via useIsHovered and
 *                  applies a left-border accent if matched.
 *    · click     — calls selectAndFocus(target) which selects the node
 *                  AND pushes the matching camera pose.
 *    · pulse     — when a Companion "View in … ↓" link scrolls to this
 *                  row, it stamps data-pulse on the row for ~1.2 s so
 *                  the user's eye catches it.
 *
 *  The hook returns everything a row needs: handlers, a stable row id
 *  (for the data-pulse stamp + scroll anchor), a color dot string, and
 *  a boolean `isHovered` for the CSS accent.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback } from "react";
import type { SceneTarget } from "../../../components/issueScene/data/types";
import {
  useSceneActions,
  useSetHover,
  useIsHovered,
  targetToRef,
} from "../../../components/issueScene/state/SceneStateContext";
import { colorForNode } from "../../../components/issueScene/colors";

export interface RowIntegration {
  /** DOM id — use as `id={id}` on the row root. */
  id: string;
  /** Color dot hex — matches the corresponding 3D node. */
  dotColor: string;
  /** True iff the current scene hoverTarget matches this row. */
  isHovered: boolean;
  /** Mouse handlers to attach to the row. */
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Click handler — selects + flies camera. Typically attached to
   *  the whole row or a trailing "↗ 3D" chip. */
  onSelect: () => void;
}

/**
 * Build integration props for a given SceneTarget. The row id follows
 * the pattern `<kind>-<id>` so the Companion's "View in ↓" jumpers
 * can find it deterministically.
 */
export function useRowIntegration(target: SceneTarget): RowIntegration {
  const actions = useSceneActions();
  const setHover = useSetHover();
  const ref = targetToRef(target);
  const isHovered = useIsHovered(ref);

  const onMouseEnter = useCallback(() => {
    setHover(ref);
  }, [setHover, ref.kind, ref.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseLeave = useCallback(() => {
    setHover(null);
  }, [setHover]);

  const onSelect = useCallback(() => {
    actions.selectAndFocus(target);
  }, [actions, target]);

  return {
    id: rowIdFor(target),
    dotColor: colorForNode(target),
    isHovered,
    onMouseEnter,
    onMouseLeave,
    onSelect,
  };
}

/** Convention: `<kind>-<id>`. Used both as DOM id (scroll target) and
 *  as the key for data-pulse sweeps from Companion Inspector jumps. */
export function rowIdFor(target: SceneTarget): string {
  switch (target.kind) {
    case "issue":
      return `issue-${target.data.id}`;
    case "ancestor":
      return `ancestor-${target.data.id}`;
    case "descendant":
      return `submatter-${target.data.id}`;
    case "run":
      return `run-${target.data.runId}`;
    case "comment":
      return `comment-${target.data.id}`;
    case "event":
      return `activity-${target.data.id}`;
    case "approval":
      return `approval-${target.data.id}`;
  }
}
