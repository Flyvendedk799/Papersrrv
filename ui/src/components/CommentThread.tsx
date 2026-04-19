import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Check, Copy, Paperclip, FileText } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { AgentIcon } from "./AgentIconPicker";
import { formatDateTime } from "../lib/utils";
import { usePapeeTargetRegistryOptional } from "../context/PapeeTargetRegistry";

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

export interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  mentions?: MentionOption[];
  /** Optional: render a small adornment (e.g. a colored dot + "↗ 3D"
   *  chip) next to each comment. Receives the commentId and returns
   *  a ReactNode placed at the trailing edge of the header row. If
   *  absent, behaves exactly as before. */
  rowAdornments?: (commentId: string) => React.ReactNode;
  /** Optional: fired when the user's pointer enters / leaves a comment
   *  row. Used by the unified IssueDetail layout to halo the matching
   *  3D comment orb. */
  onRowHover?: (commentId: string | null) => void;
  /** Optional: render a ReactNode after a given comment (or after the
   *  leading edge when null). Used by the Conversation view to inject
   *  burst markers for hidden heartbeat reports between real messages. */
  renderAfterComment?: (commentId: string | null) => React.ReactNode;
  /** Optional: ref for the comment composer so the Companion's
   *  "Write a note to unblock" CTA can focus it. Exposed as a
   *  MarkdownEditorRef because the composer is the MarkdownEditor. */
  composerRef?: React.MutableRefObject<MarkdownEditorRef | null>;
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DRAFT_DEBOUNCE_MS = 800;

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

function CopyMarkdownButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy as markdown"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

/* Each row is its own memoized component. React-query preserves the
 * inner item references via structural sharing across refetches, so
 * even when the parent timeline array ref changes every poll, the
 * individual row components see stable props and skip re-render
 * entirely. That's the one trick that prevents the markdown parser
 * from running 50× per poll cycle on big issues. */
/* Length threshold for auto-collapsing a comment body. Anything
 * shorter than this renders fully; longer bodies get clamped with
 * a "Read more" reveal so a 200-comment thread from chatty agents
 * doesn't produce a 40-screen wall. Tunable in one place. */
const COMMENT_COLLAPSE_CHARS = 480;

const CommentRow = memo(function CommentRow({
  comment,
  agentMap,
  isHighlighted,
  adornment,
  onHoverChange,
}: {
  comment: CommentWithRunMeta;
  agentMap?: Map<string, Agent>;
  isHighlighted: boolean;
  adornment?: React.ReactNode;
  onHoverChange?: (entered: boolean) => void;
}) {
  const body = comment.body ?? "";
  const isLong = body.length > COMMENT_COLLAPSE_CHARS;
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      key={comment.id}
      id={`comment-${comment.id}`}
      className={`border p-3 overflow-hidden min-w-0 rounded-sm transition-colors duration-1000 scene-aware-row group ${isHighlighted ? "border-primary/50 bg-primary/5" : "border-border"}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div className="flex items-center justify-between mb-1">
        {comment.authorAgentId ? (
          <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
            <Identity
              name={agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8)}
              size="sm"
            />
          </Link>
        ) : (
          <Identity name="You" size="sm" />
        )}
        <span className="flex items-center gap-1.5">
          {adornment}
          <a
            href={`#comment-${comment.id}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            {formatDateTime(comment.createdAt)}
          </a>
          <CopyMarkdownButton text={comment.body} />
        </span>
      </div>
      {isLong && !expanded ? (
        <div className="relative">
          <div className="max-h-[140px] overflow-hidden">
            <MarkdownBody className="text-sm">{body}</MarkdownBody>
          </div>
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[var(--boared-paper)] via-[var(--boared-paper)]/85 to-transparent pointer-events-none"
          />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="relative mt-1 inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] transition-colors"
          >
            ▼ Read the full reply · {body.length.toLocaleString()} chars
          </button>
        </div>
      ) : (
        <>
          <MarkdownBody className="text-sm">{body}</MarkdownBody>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-1 inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
            >
              ▲ Collapse
            </button>
          )}
        </>
      )}
      {comment.runId && (
        <div className="mt-2 pt-2 border-t border-border/60">
          {comment.runAgentId ? (
            <Link
              to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
              className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              run {comment.runId.slice(0, 8)}
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground">
              run {comment.runId.slice(0, 8)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

const RunRow = memo(function RunRow({
  run,
  agentMap,
}: {
  run: LinkedRunItem;
  agentMap?: Map<string, Agent>;
}) {
  return (
    <div className="border border-border bg-accent/20 p-3 overflow-hidden min-w-0 rounded-sm">
      <div className="flex items-center justify-between mb-2">
        <Link to={`/agents/${run.agentId}`} className="hover:underline">
          <Identity
            name={agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)}
            size="sm"
          />
        </Link>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(run.startedAt ?? run.createdAt)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Run</span>
        <Link
          to={`/agents/${run.agentId}/runs/${run.runId}`}
          className="inline-flex items-center rounded-md border border-border bg-accent/40 px-2 py-1 font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        >
          {run.runId.slice(0, 8)}
        </Link>
        <StatusBadge status={run.status} />
        <Link
          to={`/files?runId=${run.runId}`}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors ml-auto"
          title="View files touched by this run"
        >
          <FileText className="h-3 w-3" />
          Files
        </Link>
      </div>
    </div>
  );
});

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  highlightCommentId,
  rowAdornments,
  onRowHover,
  renderAfterComment,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  highlightCommentId?: string | null;
  rowAdornments?: (commentId: string) => React.ReactNode;
  onRowHover?: (commentId: string | null) => void;
  renderAfterComment?: (commentId: string | null) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const papeeRegistry = usePapeeTargetRegistryOptional();

  // Register each comment row as a Papee target so Papee can visually walk to / look at them.
  const commentIds = timeline.filter((t) => t.kind === "comment").map((t) => t.id).join(",");
  useEffect(() => {
    if (!papeeRegistry || !containerRef.current) return;
    const container = containerRef.current;
    const registered: string[] = [];
    const nodes = container.querySelectorAll<HTMLElement>('[id^="comment-"]');
    nodes.forEach((el, idx) => {
      const targetId = `issue-comment:${el.id.replace(/^comment-/, "")}`;
      papeeRegistry.registerTarget({
        id: targetId,
        label: `Comment ${idx + 1}`,
        category: "activity",
        priority: 1,
        element: el,
      });
      registered.push(targetId);
    });
    return () => {
      for (const id of registered) papeeRegistry.unregisterTarget(id);
    };
  }, [papeeRegistry, commentIds]);

  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments or runs yet.</p>;
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Leading burst marker — heartbeats that occurred before any
       * real message in the visible slice. */}
      {renderAfterComment?.(null)}
      {timeline.map((item) => {
        if (item.kind === "run") {
          return <RunRow key={`run:${item.run.runId}`} run={item.run} agentMap={agentMap} />;
        }
        return (
          <div key={item.comment.id}>
            <CommentRow
              comment={item.comment}
              agentMap={agentMap}
              isHighlighted={highlightCommentId === item.comment.id}
              adornment={rowAdornments?.(item.comment.id)}
              onHoverChange={
                onRowHover
                  ? (entered) =>
                      onRowHover(entered ? item.comment.id : null)
                  : undefined
              }
            />
            {renderAfterComment?.(item.comment.id)}
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  onAdd,
  issueStatus,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  mentions: providedMentions,
  rowAdornments,
  onRowHover,
  renderAfterComment,
  composerRef,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(currentAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  // Mirror the internal editorRef into the caller-supplied composerRef
  // so IssueDetail can focus() the composer on the "Write a note" CTA.
  useEffect(() => {
    if (composerRef) composerRef.current = editorRef.current;
  });
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const isClosed = issueStatus ? CLOSED_STATUSES.has(issueStatus) : false;

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [comments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: a.id,
        name: a.name,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(currentAssigneeValue);
  }, [currentAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, isClosed && reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(false);
      setReassignTarget(currentAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file || !onAttachImage) return;
    setAttaching(true);
    try {
      await onAttachImage(file);
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Comments &amp; Runs ({timeline.length})</h3>

      <TimelineList
        timeline={timeline}
        agentMap={agentMap}
        highlightCommentId={highlightCommentId}
        rowAdornments={rowAdornments}
        onRowHover={onRowHover}
        renderAfterComment={renderAfterComment}
      />

      {liveRunSlot}

      <div className="space-y-2">
        <MarkdownEditor
          ref={editorRef}
          value={body}
          onChange={setBody}
          placeholder="Leave a comment..."
          mentions={mentions}
          onSubmit={handleSubmit}
          imageUploadHandler={imageUploadHandler}
          contentClassName="min-h-[60px] text-sm"
        />
        <div className="flex items-center justify-end gap-3">
          {onAttachImage && (
            <div className="mr-auto flex items-center gap-3">
              <input
                ref={attachInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAttachFile}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => attachInputRef.current?.click()}
                disabled={attaching}
                title="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isClosed && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reopen}
                onChange={(e) => setReopen(e.target.checked)}
                className="rounded border-border"
              />
              Re-open
            </label>
          )}
          {enableReassign && reassignOptions.length > 0 && (
            <InlineEntitySelector
              value={reassignTarget}
              options={reassignOptions}
              placeholder="Assignee"
              noneLabel="No assignee"
              searchPlaceholder="Search assignees..."
              emptyMessage="No assignees found."
              onChange={setReassignTarget}
              className="text-xs h-8"
              renderTriggerValue={(option) => {
                if (!option) return <span className="text-muted-foreground">Assignee</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
              renderOption={(option) => {
                if (!option.id) return <span className="truncate">{option.label}</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
            />
          )}
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
