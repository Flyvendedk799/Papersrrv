/* ─────────────────────────────────────────────────────────────────────
 *  CommentAdornment — the scene-aware dot + ↗ 3D chip rendered next
 *  to each comment timestamp in CommentThread.
 *
 *  Injected via the <CommentThread rowAdornments={...}> prop. If the
 *  comment isn't in the scene graph (capped by COMMENT_LIMIT), the
 *  adornment renders nothing — the row falls back to its original
 *  look.
 * ───────────────────────────────────────────────────────────────────── */

import type { CommentNode } from "../../../components/issueScene/data/types";
import {
  useSceneActions,
  useSetHover,
  useIsHovered,
  targetToRef,
} from "../../../components/issueScene/state/SceneStateContext";
import { colorForNode } from "../../../components/issueScene/colors";

interface CommentAdornmentProps {
  commentNode?: CommentNode;
}

export function CommentAdornment({ commentNode }: CommentAdornmentProps) {
  if (!commentNode) return null;
  return <CommentAdornmentInner commentNode={commentNode} />;
}

function CommentAdornmentInner({ commentNode }: { commentNode: CommentNode }) {
  const actions = useSceneActions();
  const setHover = useSetHover();
  const ref = targetToRef({ kind: "comment", data: commentNode });
  const isHovered = useIsHovered(ref);
  const color = colorForNode({ kind: "comment", data: commentNode });

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Focus this comment in the 3D scene"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          actions.selectAndFocus({ kind: "comment", data: commentNode });
        }}
        onMouseEnter={() => setHover(ref)}
        onMouseLeave={() => setHover(null)}
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          background: color,
          border: "none",
          padding: 0,
          cursor: "pointer",
          boxShadow: isHovered ? `0 0 8px ${color}` : undefined,
          transition: "box-shadow 160ms ease",
        }}
      />
    </span>
  );
}
