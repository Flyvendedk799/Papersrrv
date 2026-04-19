import React, { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { activityApi } from "../api/activity";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { projectsApi } from "../api/projects";
import { filesApi } from "../api/files";
import { workflowsApi } from "../api/workflows";
import { backlogApi } from "../api/backlog";
import { useToast } from "../context/ToastContext";
import { useCompany } from "../context/CompanyContext";
import { usePanel } from "../context/PanelContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { relativeTime, cn, formatTokens } from "../lib/utils";
import { InlineEditor } from "../components/InlineEditor";
import { CommentThread } from "../components/CommentThread";
import { IssueProperties } from "../components/IssueProperties";
import { LiveRunWidget } from "../components/LiveRunWidget";
import type { MentionOption } from "../components/MarkdownEditor";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IssueDossier } from "../components/boared/IssueDossier";
import { usePapeeEnact } from "../hooks/usePapeeEnact";
import { isFeatureEnabled } from "../lib/featureFlags";
import { SentToBacklogIndicator } from "../components/backlog/SentToBacklogIndicator";
import { PageHeader } from "../components/boared/PageHeader";
import { SectionRule } from "../components/boared/Kicker";
import { IssueScene } from "../components/issueScene/IssueScene";
import { CaseCompanion } from "../components/issueScene/overlays/CaseCompanion";
import { TourPlayer } from "../components/issueScene/overlays/TourPlayer";
import { StickyMiniScene } from "../components/issueScene/overlays/StickyMiniScene";
import { useIssueGraph } from "../components/issueScene/data/useIssueGraph";
import { narrativeFor } from "../components/issueScene/scene/narrative";
import { chaptersFor, type Chapter } from "../components/issueScene/data/chapters";
import { useScrollChoreography } from "../components/issueScene/hooks/useScrollChoreography";
import { useGuidedTour } from "../components/issueScene/hooks/useGuidedTour";
import { ISSUE_SCENE_LINES } from "../components/papee/papee-tips";
import { usePapeeOptional } from "../context/PapeeContext";
import {
  SceneStateProvider,
  useSceneActions,
  useSceneState,
} from "../components/issueScene/state/SceneStateContext";
import { SubmatterRow } from "./issueDetail/rows/SubmatterRow";
import { ActivityRow } from "./issueDetail/rows/ActivityRow";
import { FileRow } from "./issueDetail/rows/FileRow";
import { ApprovalRow } from "./issueDetail/rows/ApprovalRow";
import { SceneAwareCommentThread } from "./issueDetail/rows/SceneAwareCommentThread";
import type { MarkdownEditorRef } from "../components/MarkdownEditor";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileText,
  Hexagon,
  Inbox,
  MoreHorizontal,
  Paperclip,
  SlidersHorizontal,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { MarkdownBody } from "../components/MarkdownBody";
import type { ActivityEvent, Issue, IssueComment } from "@paperclipai/shared";
import type { Agent, IssueAttachment, FileSnapshot } from "@paperclipai/shared";
import type { RunForIssue } from "../api/activity";

type CommentReassignment = {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  "issue.created": "created the issue",
  "issue.updated": "updated the issue",
  "issue.checked_out": "checked out the issue",
  "issue.released": "released the issue",
  "issue.comment_added": "added a comment",
  "issue.attachment_added": "added an attachment",
  "issue.attachment_removed": "removed an attachment",
  "issue.deleted": "deleted the issue",
  "agent.created": "created an agent",
  "agent.updated": "updated the agent",
  "agent.paused": "paused the agent",
  "agent.resumed": "resumed the agent",
  "agent.terminated": "terminated the agent",
  "heartbeat.invoked": "invoked a heartbeat",
  "heartbeat.cancelled": "cancelled a heartbeat",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function formatAction(action: string, details?: Record<string, unknown> | null): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    const parts: string[] = [];

    if (details.status !== undefined) {
      const from = previous.status;
      parts.push(
        from
          ? `changed the status from ${humanizeValue(from)} to ${humanizeValue(details.status)}`
          : `changed the status to ${humanizeValue(details.status)}`
      );
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      parts.push(
        from
          ? `changed the priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)}`
          : `changed the priority to ${humanizeValue(details.priority)}`
      );
    }
    if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
      parts.push(
        details.assigneeAgentId || details.assigneeUserId
          ? "assigned the issue"
          : "unassigned the issue",
      );
    }
    if (details.title !== undefined) parts.push("updated the title");
    if (details.description !== undefined) parts.push("updated the description");

    if (parts.length > 0) return parts.join(", ");
  }
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

function ActorIdentity({ evt, agentMap }: { evt: ActivityEvent; agentMap: Map<string, Agent> }) {
  const id = evt.actorId;
  if (evt.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  if (evt.actorType === "system") return <Identity name="System" size="sm" />;
  if (evt.actorType === "user") return <Identity name="Board" size="sm" />;
  return <Identity name={id || "Unknown"} size="sm" />;
}

function InlineFilePreview({
  companyId,
  filePath,
  contentHash,
  onClose,
}: {
  companyId: string;
  filePath: string;
  contentHash: string | null;
  onClose: () => void;
}) {
  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: queryKeys.files.content(companyId, contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, contentHash!),
    enabled: !!contentHash,
  });

  // Fallback: read from filesystem when no indexed content exists
  const needsRawFallback = !contentLoading && !content && !contentHash;
  const { data: rawContent, isLoading: rawLoading } = useQuery({
    queryKey: queryKeys.files.raw(companyId, filePath),
    queryFn: () => filesApi.rawContent(companyId, filePath),
    enabled: needsRawFallback,
    retry: false,
  });

  const displayContent = content?.content ?? rawContent?.content ?? null;
  const isMd = content?.isMarkdown ?? rawContent?.isMarkdown ?? /\.(md|mdx|markdown)$/i.test(filePath);
  const isLoading = contentLoading || (needsRawFallback && rawLoading);

  return (
    <div className="mt-2 border border-[var(--boared-rule)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--boared-paper-2)] border-b border-[var(--boared-rule)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs truncate font-mono">{filePath}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/files?file=${encodeURIComponent(filePath)}`}
            className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5"
          >
            Open in files
          </Link>
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-foreground/[0.05] transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-auto max-h-[400px] p-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : !displayContent ? (
          <p className="text-xs text-muted-foreground">No content available.</p>
        ) : (
          <>
            {needsRawFallback && (
              <p className="text-[10px] text-muted-foreground italic mb-2">
                From disk — not yet indexed by an agent run.
              </p>
            )}
            {isMd ? (
              <MarkdownBody className="text-sm">{displayContent}</MarkdownBody>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words">{displayContent}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>();
  const { selectedCompanyId } = useCompany();
  const { openPanel, closePanel, panelVisible, setPanelVisible } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { enact: enactPapeeTool } = usePapeeEnact();
  const { pushToast } = useToast();
  const backlogEnabled = isFeatureEnabled("backlog_tab_enabled");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobilePropsOpen, setMobilePropsOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState({
    approvals: false,
    cost: false,
  });

  // Listen for Companion-dispatched events so the Next-Action CTA can
  // open the approvals collapsible and focus the comment composer.
  const composerEditorRef = useRef<MarkdownEditorRef | null>(null);
  useEffect(() => {
    const expand = () =>
      setSecondaryOpen((prev) => ({ ...prev, approvals: true }));
    const focusComposer = () => composerEditorRef.current?.focus();
    window.addEventListener("paperclip:expand-approvals", expand);
    window.addEventListener("paperclip:focus-composer", focusComposer);
    return () => {
      window.removeEventListener("paperclip:expand-approvals", expand);
      window.removeEventListener("paperclip:focus-composer", focusComposer);
    };
  }, []);

  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{path: string; hash: string | null} | null>(null);
  // Cap how many comments mount to the DOM at once so giant issues
  // (hundreds of comments, each with a markdown body) stop choking
  // React's reconciliation loop. Default to the most recent 50 with
  // a "load older" button to opt into the rest.
  const COMMENTS_INITIAL_LIMIT = 50;
  const [commentLimit, setCommentLimit] = useState<number>(COMMENTS_INITIAL_LIMIT);
  // Reset the visible window when navigating between issues so a
  // new issue starts at the most-recent slice instead of inheriting
  // the previous issue's expanded state.
  useEffect(() => {
    setCommentLimit(COMMENTS_INITIAL_LIMIT);
  }, [issueId]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMarkedReadIssueIdRef = useRef<string | null>(null);

  const { data: issue, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.detail(issueId!),
    queryFn: () => issuesApi.get(issueId!),
    enabled: !!issueId,
  });

  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(issueId!),
    queryFn: () => issuesApi.listComments(issueId!),
    enabled: !!issueId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.issues.activity(issueId!),
    queryFn: () => activityApi.forIssue(issueId!),
    enabled: !!issueId,
  });

  const { data: linkedRuns } = useQuery({
    queryKey: queryKeys.issues.runs(issueId!),
    queryFn: () => activityApi.runsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 5000,
  });

  const { data: linkedApprovals } = useQuery({
    queryKey: queryKeys.issues.approvals(issueId!),
    queryFn: () => issuesApi.listApprovals(issueId!),
    enabled: !!issueId,
  });

  const { data: linkedBacklog } = useQuery({
    queryKey: queryKeys.backlog.bySource(selectedCompanyId ?? "", {
      source: "issue",
      sourceRefId: issueId ?? undefined,
    }),
    queryFn: () =>
      backlogApi.findBySource(selectedCompanyId!, {
        source: "issue",
        sourceRefId: issueId!,
      }),
    enabled: !!selectedCompanyId && !!issueId && backlogEnabled,
  });

  const runIds = useMemo(() => (linkedRuns ?? []).map((r) => r.runId), [linkedRuns]);

  const { data: issueFiles } = useQuery({
    queryKey: [...queryKeys.issues.runs(issueId!), "files"],
    queryFn: async () => {
      if (!selectedCompanyId || runIds.length === 0) return [];
      const all = await Promise.all(
        runIds.map((rid) => filesApi.runFiles(selectedCompanyId, rid).catch(() => [] as FileSnapshot[])),
      );
      // Deduplicate by filePath, keeping newest snapshot
      const byPath = new Map<string, FileSnapshot>();
      for (const snapshots of all) {
        for (const s of snapshots) {
          const existing = byPath.get(s.filePath);
          if (!existing || new Date(s.capturedAt) > new Date(existing.capturedAt)) {
            byPath.set(s.filePath, s);
          }
        }
      }
      return Array.from(byPath.values()).sort((a, b) => a.filePath.localeCompare(b.filePath));
    },
    enabled: !!issueId && !!selectedCompanyId && runIds.length > 0,
  });

  const { data: attachments } = useQuery({
    queryKey: queryKeys.issues.attachments(issueId!),
    queryFn: () => issuesApi.listAttachments(issueId!),
    enabled: !!issueId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const { data: activeRun } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId!),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const hasLiveRuns = (liveRuns ?? []).length > 0 || !!activeRun;

  // Filter out runs already shown by the live widget to avoid duplication
  const timelineRuns = useMemo(() => {
    const liveIds = new Set<string>();
    for (const r of liveRuns ?? []) liveIds.add(r.id);
    if (activeRun) liveIds.add(activeRun.id);
    if (liveIds.size === 0) return linkedRuns ?? [];
    return (linkedRuns ?? []).filter((r) => !liveIds.has(r.runId));
  }, [linkedRuns, liveRuns, activeRun]);

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const childIssues = useMemo(() => {
    if (!allIssues || !issue) return [];
    return allIssues
      .filter((i) => i.parentId === issue.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [allIssues, issue]);

  const commentReassignOptions = useMemo(() => {
    const options: Array<{ id: string; label: string; searchText?: string }> = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({ id: `agent:${agent.id}`, label: agent.name });
    }
    if (currentUserId) {
      const label = currentUserId === "local-board" ? "Board" : "Me (Board)";
      options.push({ id: `user:${currentUserId}`, label });
    }
    return options;
  }, [agents, currentUserId]);

  const currentAssigneeValue = useMemo(() => {
    if (issue?.assigneeAgentId) return `agent:${issue.assigneeAgentId}`;
    if (issue?.assigneeUserId) return `user:${issue.assigneeUserId}`;
    return "";
  }, [issue?.assigneeAgentId, issue?.assigneeUserId]);

  const commentsWithRunMeta = useMemo(() => {
    const runMetaByCommentId = new Map<string, { runId: string; runAgentId: string | null }>();
    const agentIdByRunId = new Map<string, string>();
    for (const run of linkedRuns ?? []) {
      agentIdByRunId.set(run.runId, run.agentId);
    }
    for (const evt of activity ?? []) {
      if (evt.action !== "issue.comment_added" || !evt.runId) continue;
      const details = evt.details ?? {};
      const commentId = typeof details["commentId"] === "string" ? details["commentId"] : null;
      if (!commentId || runMetaByCommentId.has(commentId)) continue;
      runMetaByCommentId.set(commentId, {
        runId: evt.runId,
        runAgentId: evt.agentId ?? agentIdByRunId.get(evt.runId) ?? null,
      });
    }
    return (comments ?? []).map((comment) => {
      const meta = runMetaByCommentId.get(comment.id);
      return meta ? { ...comment, ...meta } : comment;
    });
  }, [activity, comments, linkedRuns]);

  // Total comments and the visible window (most recent N).
  const commentsTotal = commentsWithRunMeta.length;
  const visibleComments = useMemo(() => {
    if (commentsTotal <= commentLimit) return commentsWithRunMeta;
    return commentsWithRunMeta.slice(commentsTotal - commentLimit);
  }, [commentsWithRunMeta, commentsTotal, commentLimit]);
  const hiddenCommentCount = commentsTotal - visibleComments.length;

  /* Scene graph — same memoised instance the IssueDetailShell and
   * IssueScene use. We call it here so the below-fold row components
   * can match their items to the corresponding 3D nodes (colored dot,
   * hover halo, camera fly on click). useIssueGraph is content-sig
   * memoised; calling it multiple times with identical inputs returns
   * the same object. */
  const sceneGraphForRows = useIssueGraph({
    issue: issue ?? ({} as Issue),
    comments,
    activity,
    childIssues,
    linkedRuns,
    agentMap,
    linkedApprovals,
  });

  /* Lookup maps used by SubmatterRow / ActivityRow / FileRow /
   * ApprovalRow / CommentThread adornment to find the matching scene
   * node for a below-fold row's id. */
  const rowLookups = useMemo(() => {
    const descByIssueId = new Map<string, (typeof sceneGraphForRows.descendants)[number]>();
    for (const d of sceneGraphForRows.descendants) {
      // DescendantNode.id is the child issue id for direct children;
      // for mention-derived descendants it's `mention:XXX-NN` which
      // wouldn't match a real child issue, so those rows just fall
      // back to the un-adorned view.
      descByIssueId.set(d.id, d);
    }
    const runByRunId = new Map<string, (typeof sceneGraphForRows.runs)[number]>();
    for (const r of sceneGraphForRows.runs) runByRunId.set(r.runId, r);
    const eventByEventId = new Map<string, (typeof sceneGraphForRows.events)[number]>();
    for (const e of sceneGraphForRows.events) eventByEventId.set(e.id, e);
    const approvalByApprovalId = new Map<
      string,
      (typeof sceneGraphForRows.approvals)[number]
    >();
    for (const a of sceneGraphForRows.approvals) approvalByApprovalId.set(a.id, a);
    const commentByCommentId = new Map<
      string,
      (typeof sceneGraphForRows.comments)[number]
    >();
    for (const c of sceneGraphForRows.comments) commentByCommentId.set(c.id, c);
    return {
      descByIssueId,
      runByRunId,
      eventByEventId,
      approvalByApprovalId,
      commentByCommentId,
    };
  }, [sceneGraphForRows]);

  const issueCostSummary = useMemo(() => {
    let input = 0;
    let output = 0;
    let cached = 0;
    let cost = 0;
    let hasCost = false;
    let hasTokens = false;

    for (const run of linkedRuns ?? []) {
      const usage = asRecord(run.usageJson);
      const result = asRecord(run.resultJson);
      const runInput = usageNumber(usage, "inputTokens", "input_tokens");
      const runOutput = usageNumber(usage, "outputTokens", "output_tokens");
      const runCached = usageNumber(
        usage,
        "cachedInputTokens",
        "cached_input_tokens",
        "cache_read_input_tokens",
      );
      const runCost =
        usageNumber(usage, "costUsd", "cost_usd", "total_cost_usd") ||
        usageNumber(result, "total_cost_usd", "cost_usd", "costUsd");
      if (runCost > 0) hasCost = true;
      if (runInput + runOutput + runCached > 0) hasTokens = true;
      input += runInput;
      output += runOutput;
      cached += runCached;
      cost += runCost;
    }

    return {
      input,
      output,
      cached,
      cost,
      totalTokens: input + output,
      hasCost,
      hasTokens,
    };
  }, [linkedRuns]);

  const invalidateIssue = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId!) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
    }
  };

  const markIssueRead = useMutation({
    mutationFn: (id: string) => issuesApi.markRead(id),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
      }
    },
  });

  const updateIssue = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.update(issueId!, data),
    onSuccess: () => {
      invalidateIssue();
    },
  });

  const convertToWorkflow = useMutation({
    mutationFn: () =>
      workflowsApi.generate(selectedCompanyId!, {
        description: `${issue!.title}\n\n${issue!.description ?? ""}`.trim(),
        issueId: issueId!,
      }),
    onSuccess: (workflow) => {
      navigate(`/workflows/${workflow.id}`);
    },
  });

  const moveToBacklog = useMutation({
    mutationFn: () => backlogApi.fromIssue(selectedCompanyId!, issueId!),
    onSuccess: (result) => {
      invalidateIssue();
      queryClient.invalidateQueries({
        queryKey: queryKeys.backlog.bySource(selectedCompanyId!, {
          source: "issue",
          sourceRefId: issueId!,
          sourceRefType: "issue",
        }),
      });
      pushToast({
        tone: "info",
        title: "Moved to Backlog",
        body: `Issue is now in the Backlog${
          result.issue.prevStatus !== "backlog"
            ? ` (was ${result.issue.prevStatus.replace(/_/g, " ")})`
            : ""
        }.`,
        action: { label: "View in Backlog", href: `/backlog?item=${result.item.id}` },
      });
    },
    onError: (err: Error) => {
      pushToast({
        tone: "error",
        title: "Couldn't move to Backlog",
        body: err.message,
      });
    },
  });

  const restoreFromBacklog = useMutation({
    mutationFn: (backlogItemId: string) =>
      backlogApi.restoreIssue(selectedCompanyId!, backlogItemId),
    onSuccess: () => {
      invalidateIssue();
      queryClient.invalidateQueries({
        queryKey: queryKeys.backlog.bySource(selectedCompanyId!, {
          source: "issue",
          sourceRefId: issueId!,
          sourceRefType: "issue",
        }),
      });
      pushToast({ tone: "info", title: "Issue restored" });
    },
  });

  const addComment = useMutation({
    mutationFn: ({ body, reopen }: { body: string; reopen?: boolean }) =>
      issuesApi.addComment(issueId!, body, reopen),
    onSuccess: () => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    },
  });

  const addCommentAndReassign = useMutation({
    mutationFn: ({
      body,
      reopen,
      reassignment,
    }: {
      body: string;
      reopen?: boolean;
      reassignment: CommentReassignment;
    }) =>
      issuesApi.update(issueId!, {
        comment: body,
        assigneeAgentId: reassignment.assigneeAgentId,
        assigneeUserId: reassignment.assigneeUserId,
        ...(reopen ? { status: "todo" } : {}),
      }),
    onSuccess: () => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return issuesApi.uploadAttachment(selectedCompanyId, issueId!, file);
    },
    onSuccess: () => {
      setAttachmentError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
      invalidateIssue();
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => issuesApi.deleteAttachment(attachmentId),
    onSuccess: () => {
      setAttachmentError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
      invalidateIssue();
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Delete failed");
    },
  });

  useEffect(() => {
    const titleLabel = issue?.title ?? issueId ?? "Issue";
    setBreadcrumbs([
      { label: "Issues", href: "/issues" },
      { label: hasLiveRuns ? `🔵 ${titleLabel}` : titleLabel },
    ]);
  }, [setBreadcrumbs, issue, issueId, hasLiveRuns]);

  // Redirect to identifier-based URL if navigated via UUID
  useEffect(() => {
    if (issue?.identifier && issueId !== issue.identifier) {
      navigate(`/issues/${issue.identifier}`, { replace: true });
    }
  }, [issue, issueId, navigate]);

  useEffect(() => {
    if (!issue?.id) return;
    if (lastMarkedReadIssueIdRef.current === issue.id) return;
    lastMarkedReadIssueIdRef.current = issue.id;
    markIssueRead.mutate(issue.id);
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (issue) {
      openPanel(
        <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} />
      );
    }
    return () => closePanel();
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="font-mono text-[0.72rem] text-muted-foreground">Loading...</p>;
  if (error) return <p className="font-mono text-[0.72rem] text-destructive">{error.message}</p>;
  if (!issue) return null;

  // Ancestors are returned oldest-first from the server (root at end, immediate parent at start)
  const ancestors = issue.ancestors ?? [];

  const handleFilePicked = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    await uploadAttachment.mutateAsync(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isImageAttachment = (attachment: IssueAttachment) => attachment.contentType.startsWith("image/");

  return (
    <IssueDetailShell
      issue={issue}
      comments={comments}
      activity={activity}
      childIssues={childIssues}
      linkedRuns={linkedRuns}
      agentMap={agentMap}
      linkedApprovals={linkedApprovals}
    >
      {/* ── Hero row ── wider column for scene + Companion side-by-side ── */}
      <div id="chapter-overview" className="max-w-6xl scroll-mt-8">
        <PageHeader
          kicker={<>§ {issue.identifier ?? issue.id.slice(0, 8)}</>}
          title={
            <InlineEditor
              value={issue.title}
              onSave={(title) => updateIssue.mutate({ title })}
              as="span"
              className="boared-display text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95] text-foreground"
            />
          }
          dateline={relativeTime(issue.updatedAt) + (hasLiveRuns ? " · live" : "")}
        />

        {/* Unified 3D animated case dossier. IssueDetailShell provides
            narrative + tour via context so the Dossier doesn't need
            to re-compute them; DossierMount below is a thin helper
            that reads the context and passes them in as props. */}
        <DossierMount
          issue={issue}
          comments={comments}
          activity={activity}
          childIssues={childIssues}
          linkedRuns={linkedRuns}
          agentMap={agentMap}
        />
      </div>

      {/* ── Case-file stack ── keeps the original narrow column width ── */}
      <div className="max-w-3xl space-y-6">

      {/* Parent chain breadcrumb */}
      {ancestors.length > 0 && (
        <nav
          id="chapter-lineage"
          className="flex items-center gap-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground flex-wrap scroll-mt-8"
        >
          {[...ancestors].reverse().map((ancestor, i) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <Link
                to={`/issues/${ancestor.identifier ?? ancestor.id}`}
                className="hover:text-foreground transition-colors truncate max-w-[200px] no-underline text-inherit"
                title={ancestor.title}
              >
                {ancestor.title}
              </Link>
            </span>
          ))}
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground/60 truncate max-w-[200px]">{issue.title}</span>
        </nav>
      )}

      {issue.hiddenAt && (
        <div className="flex items-center gap-2 border border-destructive px-3 py-2 font-mono text-[0.72rem] text-destructive">
          <EyeOff className="h-4 w-4 shrink-0" />
          This issue is hidden
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <StatusIcon
            status={issue.status}
            onChange={(status) => updateIssue.mutate({ status })}
          />
          <PriorityIcon
            priority={issue.priority}
            onChange={(priority) => updateIssue.mutate({ priority })}
          />

          {hasLiveRuns && (
            <span className="inline-flex items-center gap-1.5 px-1.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--boared-acid)] shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full bg-[var(--boared-acid)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 bg-[var(--boared-acid)]" />
              </span>
              Live
            </span>
          )}

          {issue.projectId ? (
            <Link
              to={`/projects/${issue.projectId}`}
              className="inline-flex items-center gap-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground transition-colors min-w-0 no-underline"
            >
              <Hexagon className="h-3 w-3 shrink-0" />
              <span className="truncate">{(projects ?? []).find((p) => p.id === issue.projectId)?.name ?? issue.projectId.slice(0, 8)}</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground opacity-50">
              <Hexagon className="h-3 w-3 shrink-0" />
              No project
            </span>
          )}

          {(issue.labels ?? []).length > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              {(issue.labels ?? []).slice(0, 4).map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground"
                >
                  <span className="inline-block h-2 w-2" style={{ backgroundColor: label.color }} />
                  {label.name}
                </span>
              ))}
              {(issue.labels ?? []).length > 4 && (
                <span className="font-mono text-[0.6rem] text-muted-foreground">+{(issue.labels ?? []).length - 4}</span>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto md:hidden shrink-0"
            onClick={() => setMobilePropsOpen(true)}
            title="Properties"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>

          <div className="hidden md:flex items-center md:ml-auto shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 transition-opacity duration-200",
                panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
              )}
              onClick={() => setPanelVisible(true)}
              title="Show properties"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={convertToWorkflow.isPending}
              onClick={() => convertToWorkflow.mutate()}
            >
              <Workflow className="h-4 w-4 mr-1" />
              {convertToWorkflow.isPending ? "Converting..." : "Convert to workflow"}
            </Button>

            {backlogEnabled && (
              <SentToBacklogIndicator
                source="issue"
                sourceRefId={issue.id}
                sourceRefType="issue"
              />
            )}

            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              {backlogEnabled && (
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-foreground/[0.03]"
                  onClick={() => {
                    const title = issue.title?.slice(0, 120) || "Captured from issue";
                    const origin = issue.identifier ?? issue.id.slice(0, 8);
                    void enactPapeeTool({
                      kind: "createBacklogItem",
                      title,
                      body: issue.description ?? undefined,
                      source: "issue",
                      sourceRef: { type: "issue", id: issue.id, identifier: issue.identifier ?? null, origin },
                      projectId: issue.projectId ?? undefined,
                      goalId: issue.goalId ?? undefined,
                    });
                    setMoreOpen(false);
                  }}
                >
                  <Inbox className="h-3 w-3" />
                  Send to Backlog
                </button>
              )}
              {backlogEnabled && issue.status !== "backlog" && (
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-foreground/[0.03]"
                  disabled={moveToBacklog.isPending}
                  onClick={() => {
                    moveToBacklog.mutate();
                    setMoreOpen(false);
                  }}
                >
                  <Inbox className="h-3 w-3" />
                  {moveToBacklog.isPending ? "Moving..." : "Move to Backlog"}
                </button>
              )}
              {backlogEnabled &&
                issue.status === "backlog" &&
                linkedBacklog &&
                linkedBacklog.length > 0 && (
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-foreground/[0.03]"
                    disabled={restoreFromBacklog.isPending}
                    onClick={() => {
                      const target = linkedBacklog[0];
                      if (!target) return;
                      restoreFromBacklog.mutate(target.id);
                      setMoreOpen(false);
                    }}
                  >
                    <Inbox className="h-3 w-3" />
                    {restoreFromBacklog.isPending
                      ? "Restoring..."
                      : "Restore from Backlog"}
                  </button>
                )}
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-foreground/[0.03] text-destructive"
                onClick={() => {
                  updateIssue.mutate(
                    { hiddenAt: new Date().toISOString() },
                    { onSuccess: () => navigate("/issues/all") },
                  );
                  setMoreOpen(false);
                }}
              >
                <EyeOff className="h-3 w-3" />
                Hide this issue
              </button>
            </PopoverContent>
            </Popover>
          </div>
        </div>

        {backlogEnabled && linkedBacklog && linkedBacklog.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Inbox className="h-3 w-3" />
            <span>Sent to Backlog:</span>
            {linkedBacklog.slice(0, 3).map((b, i) => (
              <span key={b.id} className="inline-flex items-center">
                <Link
                  to={`/backlog?item=${b.id}`}
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  title={b.title}
                >
                  {b.title.length > 40 ? `${b.title.slice(0, 40)}…` : b.title}
                </Link>
                {i < Math.min(linkedBacklog.length, 3) - 1 && <span className="mx-1">·</span>}
              </span>
            ))}
            {linkedBacklog.length > 3 && (
              <Link to="/backlog" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                +{linkedBacklog.length - 3} more
              </Link>
            )}
          </div>
        )}

        <InlineEditor
          value={issue.description ?? ""}
          onSave={(description) => updateIssue.mutate({ description })}
          as="p"
          className="text-[0.82rem] text-muted-foreground"
          placeholder="Add a description..."
          multiline
          mentions={mentionOptions}
          imageUploadHandler={async (file) => {
            const attachment = await uploadAttachment.mutateAsync(file);
            return attachment.contentPath;
          }}
        />
      </div>

      <div className="space-y-3">
        <SectionRule
          label="Attachments"
          meta={
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFilePicked}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAttachment.isPending}
                className="inline-flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                {uploadAttachment.isPending ? "Uploading..." : "Upload image"}
              </button>
            </>
          }
        />

        {attachmentError && (
          <p className="font-mono text-[0.72rem] text-destructive">{attachmentError}</p>
        )}

        {(!attachments || attachments.length === 0) ? (
          <p className="font-mono text-[0.72rem] text-muted-foreground">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="border border-[var(--boared-rule)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={attachment.contentPath}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[0.78rem] hover:underline truncate"
                    title={attachment.originalFilename ?? attachment.id}
                  >
                    {attachment.originalFilename ?? attachment.id}
                  </a>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteAttachment.mutate(attachment.id)}
                    disabled={deleteAttachment.isPending}
                    title="Delete attachment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-mono text-[0.62rem] text-muted-foreground">
                  {attachment.contentType} · {(attachment.byteSize / 1024).toFixed(1)} KB
                </p>
                {isImageAttachment(attachment) && (
                  <a href={attachment.contentPath} target="_blank" rel="noreferrer">
                    <img
                      src={attachment.contentPath}
                      alt={attachment.originalFilename ?? "attachment"}
                      className="mt-2 max-h-56 border border-[var(--boared-rule)] object-contain bg-[var(--boared-paper-2)]"
                      loading="lazy"
                    />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* THE CASE FILE — sections stacked as a continuous paper trail.
          No tabs. Each section is a labeled "filing" in the dossier. */}
      <div className="space-y-10">
        <SectionRule id="chapter-correspondence" label="Correspondence" />
          {hiddenCommentCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setCommentLimit((c) =>
                  Math.min(commentsTotal, c + COMMENTS_INITIAL_LIMIT * 2),
                )
              }
              className="w-full mb-3 px-3 py-2 border border-[var(--boared-rule)] font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              Load {Math.min(hiddenCommentCount, COMMENTS_INITIAL_LIMIT * 2)} older comments · {hiddenCommentCount} hidden
            </button>
          )}
          <SceneAwareCommentThread
            comments={visibleComments}
            linkedRuns={timelineRuns}
            issueStatus={issue.status}
            agentMap={agentMap}
            draftKey={`paperclip:issue-comment-draft:${issue.id}`}
            enableReassign
            reassignOptions={commentReassignOptions}
            currentAssigneeValue={currentAssigneeValue}
            mentions={mentionOptions}
            composerRef={composerEditorRef}
            commentNodeById={rowLookups.commentByCommentId}
            onAdd={async (body, reopen, reassignment) => {
              if (reassignment) {
                await addCommentAndReassign.mutateAsync({ body, reopen, reassignment });
                return;
              }
              await addComment.mutateAsync({ body, reopen });
            }}
            imageUploadHandler={async (file) => {
              const attachment = await uploadAttachment.mutateAsync(file);
              return attachment.contentPath;
            }}
            onAttachImage={async (file) => {
              await uploadAttachment.mutateAsync(file);
            }}
            liveRunSlot={<LiveRunWidget issueId={issueId!} companyId={issue.companyId} />}
          />

        <SectionRule id="chapter-subtasks" label="Sub-matters" meta={`${childIssues.length} ${childIssues.length === 1 ? "entry" : "entries"}`} />
        <div>
          {childIssues.length === 0 ? (
            <p className="font-mono text-[0.72rem] text-muted-foreground">No sub-issues.</p>
          ) : (
            <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
              {childIssues.map((child) => (
                <SubmatterRow
                  key={child.id}
                  child={child}
                  descendant={rowLookups.descByIssueId.get(child.id)}
                  agentMap={agentMap}
                />
              ))}
            </div>
          )}
        </div>

        <SectionRule id="chapter-work" label="Activity log" />
        <div>
          {!activity || activity.length === 0 ? (
            <p className="font-mono text-[0.72rem] text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
              {activity.slice(0, 20).map((evt) => (
                <ActivityRow
                  key={evt.id}
                  event={evt}
                  eventNode={rowLookups.eventByEventId.get(evt.id)}
                  agentMap={agentMap}
                  actorLabel={<ActorIdentity evt={evt} agentMap={agentMap} />}
                  verbLabel={formatAction(evt.action, evt.details)}
                />
              ))}
            </div>
          )}
        </div>

        {(issueFiles ?? []).length > 0 && (
        <>
        <SectionRule id="chapter-files" label="Files touched" meta={`${(issueFiles ?? []).length} ${(issueFiles ?? []).length === 1 ? "file" : "files"}`} />
        <div>
          {!linkedRuns ? (
            <p className="font-mono text-[0.72rem] text-muted-foreground">Loading runs...</p>
          ) : !issueFiles || issueFiles.length === 0 ? (
            <p className="font-mono text-[0.72rem] text-muted-foreground">No files touched by runs on this issue.</p>
          ) : (
            <>
              <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                {issueFiles.map((snap) => {
                  const isActive = viewingFile?.path === snap.filePath;
                  return (
                    <FileRow
                      key={snap.id}
                      snap={snap}
                      isActive={isActive}
                      runNode={rowLookups.runByRunId.get(snap.runId)}
                      onClick={() =>
                        setViewingFile(
                          isActive
                            ? null
                            : { path: snap.filePath, hash: snap.contentHash },
                        )
                      }
                    />
                  );
                })}
              </div>
              {viewingFile && selectedCompanyId && (
                <InlineFilePreview
                  companyId={selectedCompanyId}
                  filePath={viewingFile.path}
                  contentHash={viewingFile.hash}
                  onClose={() => setViewingFile(null)}
                />
              )}
            </>
          )}
        </div>
        </>
        )}
      </div>

      {/* Synthetic verdict anchor — matches chapter-verdict even when
          there are no approvals to render. Kept invisible. */}
      <div id="chapter-verdict" className="scroll-mt-8" aria-hidden="true" />

      {linkedApprovals && linkedApprovals.length > 0 && (
        <Collapsible
          open={secondaryOpen.approvals}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, approvals: open }))}
          className="border border-[var(--boared-rule)]"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
            <span className="boared-label">
              Linked approvals ({linkedApprovals.length})
            </span>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", secondaryOpen.approvals && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
              {linkedApprovals.map((approval) => {
                const node = rowLookups.approvalByApprovalId.get(approval.id);
                const body = (
                  <>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={approval.status} />
                      <span>
                        {approval.type
                          .replace(/_/g, " ")
                          .replace(/^./, (c) => c.toUpperCase())}
                      </span>
                      <span className="font-mono text-[0.66rem] text-muted-foreground">
                        {approval.id.slice(0, 8)}
                      </span>
                    </div>
                    <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
                      {relativeTime(approval.createdAt)}
                    </span>
                  </>
                );
                if (!node) {
                  return (
                    <Link
                      key={approval.id}
                      to={`/approvals/${approval.id}`}
                      className="flex items-center justify-between px-3 py-2 text-[0.78rem] hover:bg-foreground/[0.03] transition-colors no-underline text-inherit"
                    >
                      {body}
                    </Link>
                  );
                }
                return (
                  <ApprovalRow
                    key={approval.id}
                    approval={node}
                    href={`/approvals/${approval.id}`}
                  >
                    {body}
                  </ApprovalRow>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {linkedRuns && linkedRuns.length > 0 && (
        <Collapsible
          open={secondaryOpen.cost}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, cost: open }))}
          className="border border-[var(--boared-rule)]"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
            <span className="boared-label">Cost summary</span>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", secondaryOpen.cost && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-[var(--boared-rule)] px-3 py-2">
              {!issueCostSummary.hasCost && !issueCostSummary.hasTokens ? (
                <div className="font-mono text-[0.72rem] text-muted-foreground">No cost data yet.</div>
              ) : (
                <div className="flex flex-wrap gap-3 font-mono text-[0.72rem] text-muted-foreground tabular-nums">
                  {issueCostSummary.hasCost && (
                    <span className="text-foreground">
                      ${issueCostSummary.cost.toFixed(4)}
                    </span>
                  )}
                  {issueCostSummary.hasTokens && (
                    <span>
                      Tokens {formatTokens(issueCostSummary.totalTokens)}
                      {issueCostSummary.cached > 0
                        ? ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)}, cached ${formatTokens(issueCostSummary.cached)})`
                        : ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)})`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      </div>
      {/* ── End of case-file stack (narrow column) ── */}

      {/* Mobile properties drawer */}
      <Sheet open={mobilePropsOpen} onOpenChange={setMobilePropsOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle className="text-sm">Properties</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-4">
              <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} inline />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </IssueDetailShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  IssueSceneBlock
 *  --------------------------------------------------------------------
 *  Owns everything that hinges on a fully-loaded issue — the 3D scene,
 *  the Case Companion, the choreography hooks, the tour player, the
 *  sticky mini-scene, and the state-change Papee bubbles.
 *
 *  Living inside IssueDetail.tsx lets us share the parent's data
 *  fetches without re-fetching. Living as a separate FUNCTION lets us
 *  call hooks that depend on `issue` being defined without running
 *  afoul of React's rules-of-hooks (those hooks only mount once the
 *  parent's loading/error gates have passed).
 * ───────────────────────────────────────────────────────────────────── */
interface IssueSceneBlockProps {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  linkedApprovals?: Array<{
    id: string;
    status: string;
    requestedAt?: Date | string | null;
    decidedAt?: Date | string | null;
  }>;
}

/* Props from IssueDetail — graph + narrative + chapters + tour are
 * all computed at the IssueDetail root (so the below-fold sections
 * can also see the graph via the provider) and passed down. */
interface InnerProps extends IssueSceneBlockProps {
  graph: ReturnType<typeof useIssueGraph>;
  narrative: ReturnType<typeof narrativeFor>;
  chapters: Chapter[];
  tour: ReturnType<typeof useGuidedTour>;
}

function IssueSceneBlock(props: InnerProps) {
  const { issue, graph, narrative, chapters, tour } = props;
  const papee = usePapeeOptional();
  const actions = useSceneActions();
  const sceneState = useSceneState();

  const tourRunning = tour.status === "running";

  /* Scroll choreography — writes activeChapterKey + pose into context. */
  const scrollChor = useScrollChoreography({
    chapters,
    suspended: tourRunning,
  });

  /* Mirror scrollChor's outputs into the SceneStateContext so the
   * Companion (which reads from context) sees them. */
  useEffect(() => {
    actions.setActiveChapterKey(scrollChor.activeKey ?? null);
  }, [scrollChor.activeKey, actions]);
  useEffect(() => {
    if (scrollChor.targetPose) {
      actions.setTargetPose(scrollChor.targetPose);
    }
  }, [scrollChor.targetPose, actions]);
  /* Tour pose wins over scroll pose — push whenever it changes. */
  useEffect(() => {
    if (tour.pose) actions.setTargetPose(tour.pose);
  }, [tour.pose, actions]);

  /* Effective pose for the scene — prefer context; fall back to scroll/tour. */
  const effectivePose =
    sceneState.targetPose ?? tour.pose ?? scrollChor.targetPose;

  /* Hero visibility — an IntersectionObserver on the hero wrapper drives
   * whether the StickyMiniScene should be shown. */
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setHeroVisible(e.isIntersecting);
      },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* Scroll to the top of the hero when the user hits the sticky tile's
   * ↑ chip or clicks an overview chapter link. */
  const scrollToHero = useCallback(() => {
    const el = heroRef.current ?? document.getElementById("chapter-overview");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* Contextual Papee bubbles — fire once per case on state transitions.
   * Keyed by issue id so navigating between cases re-arms them. */
  const lastBubbleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!papee) return;
    const key = `${issue.id}:${issue.status}:${narrative.nextAction?.label ?? ""}`;
    if (lastBubbleRef.current === key) return;

    const pendingApprovals = narrative.chips.find(
      (c) => c.key === "pending-approval",
    );
    if (pendingApprovals) {
      papee.pushBubble(ISSUE_SCENE_LINES.awaitingApproval, "critical");
    } else if (issue.status === "blocked") {
      papee.pushBubble(ISSUE_SCENE_LINES.blocked, "critical");
    } else if (narrative.chips.find((c) => c.key === "stale")) {
      // days from the chip label "STALE 5D"
      const stale = narrative.chips.find((c) => c.key === "stale");
      const days = stale ? parseInt(stale.label.match(/\d+/)?.[0] ?? "0", 10) : 0;
      if (days > 0) {
        papee.pushBubble(ISSUE_SCENE_LINES.staleRun(days), "normal");
      }
    }
    lastBubbleRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id, issue.status, narrative]);

  /* Next-Action CTA dispatcher — real destinations. */
  const handleNextAction = useCallback(() => {
    const kind = narrative.nextAction?.kind;
    if (!kind) return;

    switch (kind) {
      case "approvals": {
        // Scroll to verdict anchor, expand approvals collapsible, and
        // select the oldest pending approval (Inspector mode picks up).
        const el = document.getElementById("chapter-verdict");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.dispatchEvent(new CustomEvent("paperclip:expand-approvals"));
        const oldest = graph.approvals
          .filter((a) => a.status === "pending")
          .sort((a, b) => a.requestedAt - b.requestedAt)[0];
        if (oldest) {
          actions.selectAndFocus({ kind: "approval", data: oldest });
        }
        break;
      }
      case "composer": {
        const el = document.getElementById("chapter-correspondence");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Request the composer to focus. IssueDetail wires this via
        // a CustomEvent so we don't need to thread a ref through.
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("paperclip:focus-composer"));
        }, 400);
        break;
      }
      case "run": {
        const newestLive = graph.runs
          .filter((r) => r.isLive)
          .sort((a, b) => b.startedAt - a.startedAt)[0];
        if (newestLive) {
          actions.selectAndFocus({ kind: "run", data: newestLive });
        }
        break;
      }
    }
  }, [narrative.nextAction, graph, actions]);

  return (
    <>
      <div
        ref={heroRef}
        className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 lg:gap-6"
      >
        <IssueScene
          {...props}
          height="clamp(420px, 60vh, 560px)"
          ledgerCompact
          targetPose={effectivePose}
        />
        <CaseCompanion
          {...props}
          narrative={narrative}
          chapters={chapters}
          tourCurrent={tour.current}
          onTakeTour={tour.start}
          onCancelTour={tour.cancel}
          onNextAction={handleNextAction}
        />
      </div>

      {/* Sticky mini-scene — pinned tile when the hero scrolls out. */}
      <StickyMiniScene
        {...props}
        targetPose={effectivePose}
        visible={!heroVisible}
        onReturnToTop={scrollToHero}
      />

      {/* Tour caption overlay — renders only when tour.running. */}
      <TourPlayer
        caption={tour.caption}
        current={tour.current}
        chapters={chapters}
        onCancel={tour.cancel}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  IssueDetailShell
 *  --------------------------------------------------------------------
 *  Owns the SceneStateProvider that wraps the whole issue page so
 *  the hero (3D scene + Companion) AND the below-fold case-file stack
 *  (sub-matters, activity, files, approvals, CommentThread) all share
 *  the same selection, hover, filters, active-chapter, and graph.
 *
 *  Computes graph + narrative + chapters + tour once, hoists them into
 *  the provider's `state`, and renders children unchanged.
 * ───────────────────────────────────────────────────────────────────── */
interface IssueDetailShellProps {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  linkedApprovals?: Array<{
    id: string;
    status: string;
    requestedAt?: Date | string | null;
    decidedAt?: Date | string | null;
  }>;
  children: React.ReactNode;
}

function IssueDetailShell(props: IssueDetailShellProps) {
  const graph = useIssueGraph(props);
  const narrative = useMemo(
    () => narrativeFor(graph, graph.root),
    [graph],
  );
  const chapters = useMemo(
    () => chaptersFor(graph, narrative),
    [graph, narrative],
  );
  const tour = useGuidedTour(chapters);
  const tourRunning = tour.status === "running";

  const data = useMemo(
    () => ({
      issue: props.issue,
      comments: props.comments,
      activity: props.activity,
      childIssues: props.childIssues,
      linkedRuns: props.linkedRuns,
      agentMap: props.agentMap,
      linkedApprovals: props.linkedApprovals,
      graph,
      narrative,
      chapters,
      tour,
    }),
    [
      props.issue,
      props.comments,
      props.activity,
      props.childIssues,
      props.linkedRuns,
      props.agentMap,
      props.linkedApprovals,
      graph,
      narrative,
      chapters,
      tour,
    ],
  );

  return (
    <SceneStateProvider
      graph={graph}
      narrative={narrative}
      chapters={chapters}
      tourRunning={tourRunning}
    >
      <IssueDetailDataContext.Provider value={data}>
        <div className="boared-reveal space-y-6">{props.children}</div>
      </IssueDetailDataContext.Provider>
    </SceneStateProvider>
  );
}

/* Shared issue-page data context — holds graph + narrative + chapters
 * + tour + raw props so every component under IssueDetailShell reads
 * from one place. */
interface IssueDetailData {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  linkedApprovals?: Array<{
    id: string;
    status: string;
    requestedAt?: Date | string | null;
    decidedAt?: Date | string | null;
  }>;
  graph: ReturnType<typeof useIssueGraph>;
  narrative: ReturnType<typeof narrativeFor>;
  chapters: Chapter[];
  tour: ReturnType<typeof useGuidedTour>;
}

const IssueDetailDataContext = React.createContext<IssueDetailData | null>(
  null,
);

function useIssueDetailData(): IssueDetailData {
  const v = React.useContext(IssueDetailDataContext);
  if (!v) throw new Error("Must be inside IssueDetailShell");
  return v;
}

/* Thin wrapper that reads narrative/tour from IssueDetailDataContext
 * and passes them to IssueDossier. Lets the Dossier stay decoupled
 * from the shell's internal data shape. Also defines the onNextAction
 * bridge that mirrors what the old CaseCompanion did — scroll + open
 * the relevant below-the-fold section so the chip click lands
 * somewhere meaningful. */
function DossierMount(props: {
  issue: IssueDetailData["issue"];
  comments: IssueDetailData["comments"];
  activity: IssueDetailData["activity"];
  childIssues: IssueDetailData["childIssues"];
  linkedRuns: IssueDetailData["linkedRuns"];
  agentMap: IssueDetailData["agentMap"];
}) {
  const data = useIssueDetailData();
  const tour = data.tour;
  const onNextAction = React.useCallback(() => {
    const kind = data.narrative.nextAction?.kind;
    if (!kind) return;
    const anchorId =
      kind === "approvals" ? "chapter-verdict"
      : kind === "composer" ? "chapter-correspondence"
      : kind === "run" ? "chapter-work"
      : "chapter-correspondence";
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Companion used to also dispatch side-effects (expand the
    // approvals collapsible, focus the composer). Those listeners are
    // still wired in IssueDetail — fire them so the UX matches.
    if (kind === "approvals") {
      window.dispatchEvent(new Event("paperclip:expand-approvals"));
    } else if (kind === "composer") {
      window.dispatchEvent(new Event("paperclip:focus-composer"));
    }
  }, [data.narrative]);
  return (
    <IssueDossier
      issue={props.issue}
      comments={props.comments}
      activity={props.activity}
      childIssues={props.childIssues}
      linkedRuns={props.linkedRuns}
      agentMap={props.agentMap}
      narrative={
        data.narrative.nextAction
          ? {
              nextAction: {
                kind: String(data.narrative.nextAction.kind),
                label: data.narrative.nextAction.label,
              },
            }
          : null
      }
      tour={{
        status: tour.status,
        caption: tour.caption ?? null,
        start: () => tour.start(),
        cancel: () => tour.cancel(),
      }}
      onNextAction={onNextAction}
    />
  );
}

