/**
 * CaseConversation — the /issues/:id thread, cleaned of automated
 * noise by default.
 *
 * Pipeline:
 *   raw comments → classify (heartbeat vs message) → filter
 *   → render real messages in the existing SceneAwareCommentThread
 *   → inject inline burst markers at their time positions so the
 *      reader still sees "PCM was running 58 heartbeats between
 *      CEO's msg A and COO's msg B"
 *   → offer a toggle to switch to "Full log" (unfiltered)
 *
 * Design: the component is deliberately a thin wrapper around the
 * existing thread so the thread's rich features (reassign, draft
 * persistence, scene adornments, live-run widget slot, mentions,
 * image attachments) keep working. We pre-process `comments` and
 * provide burst markers through a new `renderBetweenRows` contract.
 */

import { useMemo, useState } from "react";
import type { ActivityEvent, Agent, IssueComment } from "@paperclipai/shared";
import type { MentionOption, MarkdownEditorRef } from "../../MarkdownEditor";
import type { RunForIssue } from "../../../api/activity";
import { cn } from "../../../lib/utils";
import { SceneAwareCommentThread } from "../../../pages/issueDetail/rows/SceneAwareCommentThread";
import type { CommentNode } from "../../issueScene/data/types";
import { classifyThread, type HeartbeatBurst } from "./threadFilter";
import { CaseBurstMarker } from "./CaseBurstMarker";

type CommentWithRunMeta = IssueComment & {
  runId?: string | null;
  runAgentId?: string | null;
};

type CommentReassignment = {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};

interface Props {
  comments: CommentWithRunMeta[];
  /** Cap for initial render — applied AFTER classification so the
   * cap counts real messages, not noise. */
  initialLimit: number;
  linkedRuns: RunForIssue[];
  issueStatus: string;
  agentMap: Map<string, Agent>;
  draftKey: string;
  reassignOptions: { id: string; label: string; searchText?: string }[];
  currentAssigneeValue: string;
  mentions: MentionOption[];
  composerRef: React.RefObject<MarkdownEditorRef | null>;
  commentNodeById: Map<string, CommentNode>;
  activity?: ActivityEvent[];
  onAdd: (
    body: string,
    reopen?: boolean,
    reassignment?: CommentReassignment,
  ) => Promise<void>;
  imageUploadHandler: (file: File) => Promise<string>;
  onAttachImage: (file: File) => Promise<void>;
  liveRunSlot: React.ReactNode;
  className?: string;
}

type ViewMode = "conversation" | "full";

export function CaseConversation(props: Props) {
  const [mode, setMode] = useState<ViewMode>("conversation");
  const [showOlder, setShowOlder] = useState(false);

  // Classify once per comments change.
  const classified = useMemo(
    () => classifyThread(props.comments),
    [props.comments],
  );

  // Which comments the thread actually renders.
  const effective: CommentWithRunMeta[] =
    mode === "conversation"
      ? (classified.messages as CommentWithRunMeta[])
      : props.comments;

  const total = effective.length;
  // Apply "latest N" cap — measured in effective comments so the
  // cap is meaningful regardless of mode.
  const limit = showOlder ? total : props.initialLimit;
  const visible = useMemo(
    () =>
      total <= limit
        ? effective
        : effective.slice(total - limit),
    [effective, total, limit],
  );
  const hidden = total - visible.length;

  // Bursts that belong to the VISIBLE slice only. A burst is
  // associated with the message immediately before it (or "top" /
  // "bottom" when at the extremes). We filter the full burst list
  // down to those whose `afterCommentId` is a visible message, or
  // whose `beforeCommentId` is a visible message (to catch the
  // leading burst when the first real message is visible).
  const visibleIds = useMemo(() => new Set(visible.map((c) => c.id)), [visible]);
  const burstsForConversation: HeartbeatBurst[] =
    mode === "conversation"
      ? classified.bursts.filter((b) => {
          // Keep the leading burst when the first visible comment is
          // also the first real message in the thread.
          if (b.afterCommentId == null && visible.length > 0) {
            return visibleIds.has(visible[0].id);
          }
          // Otherwise only keep bursts whose anchor is on-screen.
          return b.afterCommentId != null && visibleIds.has(b.afterCommentId);
        })
      : [];

  // Map heartbeat-comment id → the comment object, for fast lookup
  // when a burst marker expands.
  const heartbeatById = useMemo(() => {
    const m = new Map<string, IssueComment>();
    for (const h of classified.heartbeats) m.set(h.id, h);
    return m;
  }, [classified.heartbeats]);

  const renderBurstAfter = (commentId: string | null) => {
    const bursts = burstsForConversation.filter(
      (b) => b.afterCommentId === commentId,
    );
    if (bursts.length === 0) return null;
    return (
      <>
        {bursts.map((b, i) => (
          <CaseBurstMarker
            key={`burst-${commentId ?? "head"}-${i}`}
            burst={b}
            comments={b.commentIds
              .map((id) => heartbeatById.get(id))
              .filter((c): c is IssueComment => !!c)}
            agentMap={props.agentMap}
          />
        ))}
      </>
    );
  };

  return (
    <div className={cn("space-y-3", props.className)}>
      {/* Mode toggle + summary banner */}
      <header className="flex items-center flex-wrap gap-2 text-[0.72rem]">
        <div
          className="inline-flex items-center border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
          role="tablist"
        >
          <ModeTab
            active={mode === "conversation"}
            onClick={() => setMode("conversation")}
            label="Conversation"
            sub={classified.messageCount.toLocaleString()}
          />
          <ModeTab
            active={mode === "full"}
            onClick={() => setMode("full")}
            label="Full log"
            sub={props.comments.length.toLocaleString()}
          />
        </div>
        {mode === "conversation" && classified.heartbeatCount > 0 && (
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            {classified.heartbeatCount} automated {classified.heartbeatCount === 1 ? "report" : "reports"} folded
          </span>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowOlder(true)}
            className="ml-auto font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
          >
            Load {hidden} older {mode === "conversation" ? "messages" : "entries"}
          </button>
        )}
      </header>

      {/* Leading burst — before any real message. */}
      {renderBurstAfter(null)}

      {/* Thread + injected bursts between rows */}
      <SceneAwareCommentThread
        comments={visible}
        linkedRuns={props.linkedRuns}
        issueStatus={props.issueStatus}
        agentMap={props.agentMap}
        draftKey={props.draftKey}
        enableReassign
        reassignOptions={props.reassignOptions}
        currentAssigneeValue={props.currentAssigneeValue}
        mentions={props.mentions}
        composerRef={props.composerRef}
        commentNodeById={props.commentNodeById}
        onAdd={props.onAdd}
        imageUploadHandler={props.imageUploadHandler}
        onAttachImage={props.onAttachImage}
        liveRunSlot={props.liveRunSlot}
        renderAfterComment={renderBurstAfter}
      />
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-baseline gap-1.5 px-3 py-1.5 font-mono uppercase tracking-[0.14em] text-[0.56rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/40",
        active
          ? "bg-[var(--boared-paper)] text-[var(--boared-ink)]"
          : "text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:bg-[var(--boared-paper)]",
      )}
    >
      {label}
      <span className="tabular-nums text-[var(--boared-ink-faint)]">{sub}</span>
    </button>
  );
}
