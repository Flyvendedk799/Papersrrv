/* ─────────────────────────────────────────────────────────────────────
 *  SceneAwareCommentThread — a thin wrapper that injects the
 *  scene-aware adornment + hover bridge into <CommentThread>.
 *
 *  Lives as a sibling of CommentThread so the adornment slot never
 *  forks the markdown pipeline, and lives inside IssueDetailShell's
 *  provider so it can use useSetHover + useSceneActions.
 *
 *  If a comment id isn't present in the scene graph (capped by
 *  COMMENT_LIMIT in useIssueGraph), the adornment renders nothing
 *  and hover is a noop — the row falls back to its original behavior.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback } from "react";
import {
  CommentThread,
  type CommentThreadProps,
} from "../../../components/CommentThread";
import type { CommentNode } from "../../../components/issueScene/data/types";
import { useSetHover } from "../../../components/issueScene/state/SceneStateContext";
import { CommentAdornment } from "./CommentAdornment";

interface SceneAwareCommentThreadProps extends CommentThreadProps {
  /** Lookup from commentId → CommentNode. */
  commentNodeById: Map<string, CommentNode>;
}

/**
 * SceneAwareCommentThread — attaches the 3D scene's hover store + the
 * colored-dot adornment to each comment row of the base CommentThread.
 *
 * Perf note: this component previously wrapped its pass-through in a
 * `useMemo({ ...rest, rowAdornments, onRowHover })`. That was a memo
 * anti-pattern: `rest` is recreated every render by the destructure,
 * so the memo dep never hit equality and the spread object was a new
 * ref every render. That busted CommentThread's inner `TimelineList`
 * memo and caused all 50+ comment rows to reconcile on every parent
 * re-render (selection change, search keystroke, scroll-spy chapter
 * flip, etc.). We now pass the stable `useCallback` handlers directly
 * so the memo chain holds.
 */
export function SceneAwareCommentThread({
  commentNodeById,
  ...rest
}: SceneAwareCommentThreadProps) {
  const setHover = useSetHover();

  const rowAdornments = useCallback(
    (commentId: string) => {
      const node = commentNodeById.get(commentId);
      return <CommentAdornment commentNode={node} />;
    },
    [commentNodeById],
  );

  const onRowHover = useCallback(
    (commentId: string | null) => {
      if (!commentId) {
        setHover(null);
        return;
      }
      const node = commentNodeById.get(commentId);
      if (!node) return;
      setHover({ kind: "comment", id: node.id });
    },
    [commentNodeById, setHover],
  );

  return (
    <CommentThread
      {...rest}
      rowAdornments={rowAdornments}
      onRowHover={onRowHover}
    />
  );
}
