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
import { IssueLinksPanel } from "../components/issue/IssueLinksPanel";
import { IssueWatchersPanel } from "../components/issue/IssueWatchersPanel";
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
import { CaseHero } from "../components/boared/caseFile/CaseHero";
import { CaseProblem } from "../components/boared/caseFile/CaseProblem";
import { CaseBanner } from "../components/boared/caseFile/CaseBanner";
import { CasePageLayout } from "../components/boared/caseFile/CasePageLayout";
import { CaseSectionRule } from "../components/boared/caseFile/CaseSectionRule";
import { ChapterHeading } from "../components/boared/caseFile/ChapterHeading";
import { ChapterNav } from "../components/boared/caseFile/ChapterNav";
import { ScrollProgressRail } from "../components/boared/caseFile/ScrollProgressRail";
import { ImmersiveGraphFrame } from "../components/boared/caseFile/ImmersiveGraphFrame";
import { CaseArcRibbon } from "../components/boared/caseFile/CaseArcRibbon";
import { CaseBrief } from "../components/boared/caseFile/CaseBrief";
import { CaseArchive } from "../components/boared/caseFile/CaseArchive";
import { CaseQuickProps } from "../components/boared/caseFile/CaseQuickProps";
import { CaseSidebar } from "../components/boared/caseFile/CaseSidebar";
import { CaseArtifacts } from "../components/boared/caseFile/CaseArtifacts";
import { IssueOpenPrAction } from "../components/issue/IssueOpenPrAction";
import { CaseAtAGlance } from "../components/boared/caseFile/CaseAtAGlance";
import { CaseParticipants } from "../components/boared/caseFile/CaseParticipants";
import { CaseRecentActivity } from "../components/boared/caseFile/CaseRecentActivity";
import { CasePlanDocument } from "../components/boared/caseFile/CasePlanDocument";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { usePinned } from "../hooks/usePinned";
import { CaseChapterNav } from "../components/boared/caseFile/CaseChapterNav";
import { CaseStickyBar } from "../components/boared/caseFile/CaseStickyBar";
import { useCaseKeyboardNav } from "../components/boared/caseFile/useCaseKeyboardNav";
import { CaseKeyboardCheatSheet } from "../components/boared/caseFile/CaseKeyboardCheatSheet";
import type { CaseSynthesisPayload } from "../api/issues";
import { usePapeeEnact } from "../hooks/usePapeeEnact";
import { isFeatureEnabled } from "../lib/featureFlags";
import { SentToBacklogIndicator } from "../components/backlog/SentToBacklogIndicator";
import { PageHeader } from "../components/boared/PageHeader";
import { SectionRule } from "../components/boared/Kicker";
// Scene infrastructure the Dossier + row components still consume.
// The old IssueSceneBlock + CaseCompanion / TourPlayer / StickyMiniScene
// /useScrollChoreography usages were deleted along with that block.
import { useIssueGraph } from "../components/issueScene/data/useIssueGraph";
import { narrativeFor } from "../components/issueScene/scene/narrative";
import { chaptersFor, type Chapter } from "../components/issueScene/data/chapters";
import { useGuidedTour } from "../components/issueScene/hooks/useGuidedTour";
import { SceneStateProvider } from "../components/issueScene/state/SceneStateContext";
import { SubmatterRow } from "./issueDetail/rows/SubmatterRow";
import { ActivityRow } from "./issueDetail/rows/ActivityRow";
import { FileRow } from "./issueDetail/rows/FileRow";
import { ApprovalRow } from "./issueDetail/rows/ApprovalRow";
import { SceneAwareCommentThread } from "./issueDetail/rows/SceneAwareCommentThread";
import { CaseConversation } from "../components/boared/caseFile/CaseConversation";
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
            type="button"
            onClick={onClose}
            className="p-0.5 hover:bg-foreground/[0.05] transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
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
  // Track visits so the sidebar's "Recent" list reflects where the
  // user's been. Fires once per mount when we have issue data.
  const { record: recordRecentView } = useRecentlyViewed(selectedCompanyId);
  const { isPinned, toggle: togglePin } = usePinned(selectedCompanyId);
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

  // Imperative actions the Dossier's next-action chip can invoke to
  // jump the reader to a relevant below-the-fold section — exposed
  // via IssueDetailActionsContext so the chip never has to reach
  // across the DOM or dispatch window events.
  const composerEditorRef = useRef<MarkdownEditorRef | null>(null);
  const expandApprovals = useCallback(() => {
    setSecondaryOpen((prev) => ({ ...prev, approvals: true }));
  }, []);
  const focusComposer = useCallback(() => {
    composerEditorRef.current?.focus();
  }, []);
  const issueDetailActions = useMemo(
    () => ({ expandApprovals, focusComposer }),
    [expandApprovals, focusComposer],
  );

  // Keyboard navigation for the whole case page — j/k cycle sections,
  // r focuses composer, g jumps to graph, etc. `?` toggles the
  // cheat-sheet that documents the bindings.
  const { cheatSheetOpen, setCheatSheetOpen } = useCaseKeyboardNav({
    chapters: [
      { id: "chapter-overview", label: "Overview" },
      { id: "chapter-description", label: "Problem" },
      { id: "chapter-artifacts", label: "Made" },
      { id: "chapter-graph", label: "Story" },
      { id: "chapter-correspondence", label: "Thread" },
      { id: "chapter-files", label: "Files" },
      { id: "chapter-work", label: "Log" },
      { id: "chapter-verdict", label: "Approvals" },
    ],
    onFocusComposer: focusComposer,
  });

  // Case synthesis — the abstract + artifacts + graph payload the
  // CasePage renders. Reads the same cached query CaseHero uses so
  // fetching happens once per page.
  const synthesisQuery = useQuery({
    queryKey: queryKeys.issues.synthesis(issueId!),
    queryFn: () => issuesApi.synthesis(issueId!),
    enabled: !!issueId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const synthesis: CaseSynthesisPayload | null = synthesisQuery.data ?? null;

  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{path: string; hash: string | null} | null>(null);
  /* Compact-by-default flags — each section caps at a small N with
   * a "Show all" expander so big cases don't require 4 screens of
   * scrolling. Kept in local component state; resets per issue. */
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const ACTIVITY_COMPACT_LIMIT = 5;
  const FILES_COMPACT_LIMIT = 6;
  // Cap how many comments mount to the DOM at once so giant issues
  // (hundreds of comments, each with a markdown body) stop choking
  // React's reconciliation loop. Default to the most recent 50 with
  // a "load older" button to opt into the rest.
  const COMMENTS_INITIAL_LIMIT = 8;
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

  // S4 — live delegation graph. Whenever the in-flight run set
  // changes (new run started, run finished, status flipped) bust
  // the synthesis cache so the case graph re-renders with the new
  // fan-out/fan-in shape. The synthesis service hashes its inputs,
  // so this only causes a real re-compute when state actually moved.
  const liveSignature = useMemo(() => {
    const ids: string[] = [];
    for (const r of liveRuns ?? []) ids.push(`${r.id}:${r.status}`);
    if (activeRun) ids.push(`${activeRun.id}:${activeRun.status}`);
    return ids.sort().join(",");
  }, [liveRuns, activeRun]);
  useEffect(() => {
    if (!issueId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issueId) });
  }, [liveSignature, issueId, queryClient]);

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
    // v3: bust the case-file synthesis so its abstract + graph
    // refresh with the new comment / status / run state.
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issueId!) });
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

  /* Planning-issue foundation. When a planning-kind issue has
   * converged on a plan, the user presses "Save as Backlog Plan" —
   * the server reformats the plan output against the enforced
   * PlanOutput schema, creates a backlog_plan row linked back to
   * this issue, and marks the issue done + transferred. Idempotent
   * on the server; retries are safe. */
  const transferToBacklog = useMutation({
    mutationFn: () => issuesApi.transferToBacklog(issueId!),
    onSuccess: (result) => {
      pushToast({
        tone: result.alreadyExisted ? "info" : "success",
        title: result.alreadyExisted
          ? "This plan was already in the backlog"
          : "Plan saved to Backlog",
      });
      invalidateIssue();
      if (selectedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.backlog.plans(selectedCompanyId),
        });
      }
      navigate(`/backlog?plan=${result.plan.id}`);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title:
          err instanceof Error && err.message
            ? `Couldn't save plan — ${err.message}`
            : "Couldn't save plan to Backlog",
      });
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
    // Record for "Recently viewed" sidebar / command palette.
    recordRecentView({
      id: issue.id,
      kind: "issue",
      label: issue.title,
      href: `/issues/${issue.identifier ?? issue.id}`,
    });
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (issue) {
      openPanel(
        <div className="space-y-5">
          <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} />
          {/* F6 / F7 — cross-issue links + watchers in the
           * properties panel so they're always reachable without
           * scrolling the case file. */}
          <div className="pt-3 border-t border-[var(--boared-rule)]">
            <IssueLinksPanel issueId={issue.id} />
          </div>
          <div className="pt-3 border-t border-[var(--boared-rule)]">
            <IssueWatchersPanel issueId={issue.id} />
          </div>
        </div>
      );
    }
    return () => closePanel();
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <IssueDetailSkeleton />;
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-4 py-10">
        <div className="border border-destructive/60 bg-destructive/[0.04] p-6">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-destructive mb-2">
            Couldn't load this case
          </p>
          <p className="text-[0.88rem] text-[var(--boared-ink)] mb-4">{error.message}</p>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) })}
            className="inline-flex items-center gap-1.5 h-8 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] border border-[var(--boared-rule)] text-[var(--boared-ink)] hover:bg-[var(--boared-ink)]/[0.06] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!issue) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-4 py-16 text-center">
        <p className="font-serif italic text-[1.4rem] leading-tight text-[var(--boared-ink)] mb-2">
          This case can't be found.
        </p>
        <p className="text-[0.88rem] text-[var(--boared-ink-faint)] mb-6">
          It may have been deleted, moved, or you may not have access.
        </p>
        <Link
          to="/issues"
          className="inline-flex items-center gap-1.5 h-8 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] border border-[var(--boared-rule)] text-[var(--boared-ink)] hover:bg-[var(--boared-ink)]/[0.06] transition-colors no-underline"
        >
          ← Back to issues
        </Link>
      </div>
    );
  }

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

  /* Promoted approval banner — when the case is waiting on a human
   * decision, this sits directly below the hero and above the
   * artifacts so readers can't miss what's blocking progress. */
  const pendingApprovals = (linkedApprovals ?? []).filter((a) => a.status === "pending");
  const pendingCount = pendingApprovals.length;
  const hasPendingApproval = pendingCount > 0;

  return (
    <IssueDetailActionsContext.Provider value={issueDetailActions}>
    <IssueDetailShell
      issue={issue}
      comments={comments}
      activity={activity}
      childIssues={childIssues}
      linkedRuns={linkedRuns}
      agentMap={agentMap}
      linkedApprovals={linkedApprovals}
    >
      {/* Scroll progress rail — acid thread across the very top of
       * the viewport that fills as the reader moves through the
       * case. Ambient immersion cue. */}
      <ScrollProgressRail />

      {/* Sticky reading aid — md+ only, appears after the hero
       * scrolls past the viewport. Keeps identity + quick-jump
       * chips always reachable. */}
      <CaseStickyBar
        issue={issue}
        heroAnchorId="chapter-overview"
        chapters={[
          { id: "chapter-description", label: "Problem" },
          { id: "chapter-artifacts", label: "Made" },
          { id: "chapter-graph", label: "Story" },
          { id: "chapter-correspondence", label: "Thread" },
          ...((issueFiles ?? []).length > 0
            ? [{ id: "chapter-files", label: "Files" }]
            : []),
          ...(activity && activity.length > 0
            ? [{ id: "chapter-work", label: "Log" }]
            : []),
        ]}
      />

      {/* Mobile sticky identity — pins the kicker + title + status
       * chips to the viewport top once the user scrolls past the
       * hero. Hidden on md+ since CaseStickyBar takes over. */}
      <div className="md:hidden sticky top-0 z-30 -mx-3 px-3 py-2 bg-[var(--boared-paper)]/95 backdrop-blur-sm border-b border-[var(--boared-rule)]/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] shrink-0">
            § {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          <span className="truncate text-[0.78rem] text-[var(--boared-ink)]" title={issue.title}>
            {issue.title}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0"
            onClick={() => setMobilePropsOpen(true)}
            title="Properties"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CasePageLayout
        chapterNav={
          <CaseChapterNav
            markers={[
              { id: "chapter-overview", label: "Overview" },
              { id: "chapter-description", label: "The problem" },
              { id: "chapter-artifacts", label: "What was made" },
              { id: "chapter-graph", label: "How it got here" },
              { id: "chapter-correspondence", label: "Conversation" },
              ...((issueFiles ?? []).length > 0
                ? [{ id: "chapter-files", label: "Files touched" }]
                : []),
              ...(activity && activity.length > 0
                ? [{ id: "chapter-work", label: "Activity log" }]
                : []),
              ...(linkedApprovals && linkedApprovals.length > 0
                ? [{ id: "chapter-verdict", label: "Approvals" }]
                : []),
            ]}
          />
        }
        lineage={
          ancestors.length > 0 ? (
            <nav
              id="chapter-lineage"
              aria-label="Case lineage"
              className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[var(--boared-ink-faint)] flex-wrap scroll-mt-8"
            >
              {[...ancestors].reverse().map((ancestor, i) => (
                <span key={ancestor.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  <Link
                    to={`/issues/${ancestor.identifier ?? ancestor.id}`}
                    className="hover:text-[var(--boared-ink)] transition-colors truncate max-w-[200px] no-underline text-inherit"
                    title={ancestor.title}
                  >
                    {ancestor.title}
                  </Link>
                </span>
              ))}
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="text-[var(--boared-ink)] truncate max-w-[200px]">{issue.title}</span>
            </nav>
          ) : null
        }
        hero={
          <div id="chapter-overview" className="scroll-mt-8 space-y-3">
            {/* Narrative arc — opens to closes / in-flight. */}
            <CaseArcRibbon issue={issue} hasLiveRuns={hasLiveRuns} />
            <CaseHero
              issue={issue}
              hasLiveRuns={hasLiveRuns}
              onUpdate={(patch) => updateIssue.mutate(patch)}
            />
            {/* Inline properties strip — replaces the sidebar-only
             * read path for the core fields. The sidebar still has
             * the full editors; this is a glanceable overview. */}
            <CaseQuickProps
              issue={issue}
              onOpenProperties={() => setMobilePropsOpen(true)}
            />
            {/* Description inline — no chapter heading, but we scope
             * an anchor so the chapter nav has a real scroll target. */}
            <div id="chapter-description" className="scroll-mt-8">
            <CaseBrief
              description={issue.description}
              onSave={(description) => updateIssue.mutate({ description })}
              mentions={mentionOptions}
              onAttachImage={async (file) => {
                const attachment = await uploadAttachment.mutateAsync(file);
                return attachment.contentPath;
              }}
            />
            </div>
            {issue.hiddenAt && (
              <div className="flex items-center gap-2 border border-destructive/60 bg-destructive/[0.04] px-3 py-2 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-destructive">
                <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This case is hidden
              </div>
            )}
            {hasPendingApproval && (
              <CaseBanner
                tone="alert"
                title={pendingCount === 1 ? "Waiting on approval" : `Waiting on ${pendingCount} approvals`}
                detail={
                  pendingCount === 1
                    ? "This case is blocked on a human decision."
                    : `${pendingCount} decisions are blocking this case from moving forward.`
                }
                action={{
                  label: "Review",
                  onClick: () => {
                    issueDetailActions.expandApprovals();
                    document.getElementById("chapter-verdict")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  },
                }}
              />
            )}
            {/* S5 — kick off a draft PR straight from the case. Only
             * visible if the issue is attached to a project; the
             * server validates that the project's workspace has a
             * repoUrl and a github connection is configured. */}
            <IssueOpenPrAction
              companyId={selectedCompanyId!}
              issueId={issue.id}
              hasProject={!!issue.projectId}
            />
            {backlogEnabled && linkedBacklog && linkedBacklog.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--boared-ink-faint)]">
                <Inbox className="h-3 w-3" aria-hidden="true" />
                <span>Sent to backlog:</span>
                {linkedBacklog.slice(0, 3).map((b, i) => (
                  <span key={b.id} className="inline-flex items-center">
                    <Link
                      to={`/backlog?item=${b.id}`}
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--boared-ink)] transition-colors"
                      title={b.title}
                    >
                      {b.title.length > 40 ? `${b.title.slice(0, 40)}…` : b.title}
                    </Link>
                    {i < Math.min(linkedBacklog.length, 3) - 1 && <span className="mx-1">·</span>}
                  </span>
                ))}
                {linkedBacklog.length > 3 && (
                  <Link to="/backlog" className="underline decoration-dotted underline-offset-2 hover:text-[var(--boared-ink)] transition-colors">
                    +{linkedBacklog.length - 3} more
                  </Link>
                )}
              </div>
            )}
          </div>
        }
        main={
          <>
            {/* Chapter 1 — What was made. Outcome leads. Artifacts
             * are produced by the work (PRs, run summaries, sub-cases,
             * approvals); they answer the user's first question — what
             * actually exists now? — before we narrate how we got here. */}
            <section id="chapter-artifacts" className="scroll-mt-20 space-y-4">
              <ChapterHeading
                title="What was made"
                meta={
                  synthesis?.artifacts?.length
                    ? `${synthesis.artifacts.length} ${synthesis.artifacts.length === 1 ? "artifact" : "artifacts"}`
                    : undefined
                }
                action={
                  <button
                    type="button"
                    onClick={() =>
                      queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issue.id) })
                    }
                    className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
                    title="Re-synthesise"
                  >
                    ↻
                  </button>
                }
              />
              <CaseArtifacts
                artifacts={synthesis?.artifacts ?? []}
                loading={synthesisQuery.isLoading}
              />
            </section>

            {/* Chapter 2 — How it got here. The fan-out/fan-in flow
             * graph follows the outcome so the reader can trace
             * causality once they know what shipped. */}
            <section id="chapter-graph" className="scroll-mt-20 space-y-4">
              <ChapterHeading
                title="How it got here"
                meta={
                  synthesis?.graph?.nodes?.length
                    ? `${synthesis.graph.nodes.length} ${synthesis.graph.nodes.length === 1 ? "step" : "steps"}${hasLiveRuns ? " · live" : ""}`
                    : hasLiveRuns ? "live" : undefined
                }
                action={
                  <button
                    type="button"
                    onClick={() =>
                      queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issue.id) })
                    }
                    className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
                    title="Re-synthesise"
                  >
                    ↻
                  </button>
                }
              />
              <ImmersiveGraphFrame
                issue={issue}
                comments={comments ?? []}
                activity={activity ?? []}
                childIssues={childIssues}
                linkedRuns={linkedRuns ?? []}
                agentMap={agentMap}
                loading={synthesisQuery.isLoading}
                live={hasLiveRuns}
              />
              {/* Planning plan document — ONLY surface the plan
               * document for planning-kind issues, inline under the
               * graph. Artifacts are reachable via the Archive tabs
               * below, so no dedicated "What was made" chapter. */}
              {issue.kind === "planning" && issue.planOutputJson && (
                <CasePlanDocument
                  plan={issue.planOutputJson as unknown as import("@paperclipai/shared").PlanOutput}
                  animateIn
                />
              )}
            </section>

            {/* The conversation — filters out automated heartbeat
             * posts so the reader sees the real dialogue first.
             * Pass the FULL comment list; CaseConversation handles
             * classification, capping, older-loading and the
             * Conversation/Full-log toggle internally. */}
            <section id="chapter-correspondence" className="scroll-mt-20 space-y-4">
              <ChapterHeading
                title="Thread"
                meta={
                  commentsTotal > 0
                    ? `${commentsTotal} ${commentsTotal === 1 ? "entry" : "entries"}`
                    : undefined
                }
              />
              <CaseConversation
                comments={commentsWithRunMeta}
                initialLimit={COMMENTS_INITIAL_LIMIT}
                linkedRuns={timelineRuns}
                issueStatus={issue.status}
                agentMap={agentMap}
                draftKey={`paperclip:issue-comment-draft:${issue.id}`}
                reassignOptions={commentReassignOptions}
                currentAssigneeValue={currentAssigneeValue}
                mentions={mentionOptions}
                composerRef={composerEditorRef}
                commentNodeById={rowLookups.commentByCommentId}
                activity={activity}
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
            </section>

            {/* Archive — Files / Activity / Attachments / Approvals
             * consolidated into a single tab panel at the bottom.
             * Replaces four separate chapters that all read as
             * supplementary reference material anyway. */}
            <CaseArchive
              tabs={[
                {
                  id: "files",
                  label: "Files",
                  count: (issueFiles ?? []).length,
                  show: (issueFiles ?? []).length > 0,
                  render: () => (
                    <div className="space-y-3">
                      <div className="border border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                        {(issueFiles ?? [])
                          .slice(0, showAllFiles ? undefined : FILES_COMPACT_LIMIT)
                          .map((snap) => {
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
                      {!showAllFiles && (issueFiles ?? []).length > FILES_COMPACT_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllFiles(true)}
                          className="w-full py-2 border border-dashed border-[var(--boared-rule)] font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:border-[var(--boared-ink-soft)] hover:bg-[var(--boared-paper-2)] transition-colors"
                        >
                          Show all {(issueFiles ?? []).length}
                        </button>
                      )}
                      {showAllFiles && (
                        <button
                          type="button"
                          onClick={() => setShowAllFiles(false)}
                          className="w-full py-2 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
                        >
                          Collapse
                        </button>
                      )}
                      {viewingFile && selectedCompanyId && (
                        <InlineFilePreview
                          companyId={selectedCompanyId}
                          filePath={viewingFile.path}
                          contentHash={viewingFile.hash}
                          onClose={() => setViewingFile(null)}
                        />
                      )}
                    </div>
                  ),
                },
                {
                  id: "activity",
                  label: "Activity",
                  count: activity?.length ?? 0,
                  show: Boolean(activity && activity.length > 0),
                  render: () => (
                    <div className="space-y-3">
                      <div className="border border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                        {(activity ?? [])
                          .slice(0, showAllActivity ? 200 : ACTIVITY_COMPACT_LIMIT)
                          .map((evt) => (
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
                      {!showAllActivity && (activity?.length ?? 0) > ACTIVITY_COMPACT_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllActivity(true)}
                          className="w-full py-2 border border-dashed border-[var(--boared-rule)] font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:border-[var(--boared-ink-soft)] hover:bg-[var(--boared-paper-2)] transition-colors"
                        >
                          Show all {Math.min(activity?.length ?? 0, 200)}
                        </button>
                      )}
                      {showAllActivity && (
                        <button
                          type="button"
                          onClick={() => setShowAllActivity(false)}
                          className="w-full py-2 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
                        >
                          Collapse
                        </button>
                      )}
                    </div>
                  ),
                },
                {
                  id: "approvals",
                  label: "Approvals",
                  count: linkedApprovals?.length ?? 0,
                  show: Boolean(linkedApprovals && linkedApprovals.length > 0),
                  render: () => (
                    <div id="chapter-verdict" className="border border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                      {(linkedApprovals ?? []).map((approval) => {
                        const node = rowLookups.approvalByApprovalId.get(approval.id);
                        const body = (
                          <>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={approval.status} />
                              <span className="text-[0.84rem] text-[var(--boared-ink)]">
                                {approval.type
                                  .replace(/_/g, " ")
                                  .replace(/^./, (c) => c.toUpperCase())}
                              </span>
                              <span className="font-mono text-[0.6rem] tabular-nums text-[var(--boared-ink-faint)]">
                                {approval.id.slice(0, 8)}
                              </span>
                            </div>
                            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] tabular-nums text-[var(--boared-ink-faint)]">
                              {relativeTime(approval.createdAt)}
                            </span>
                          </>
                        );
                        if (!node) {
                          return (
                            <Link
                              key={approval.id}
                              to={`/approvals/${approval.id}`}
                              className="flex items-center justify-between px-3 py-2 hover:bg-[var(--boared-paper-2)] transition-colors no-underline text-inherit"
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
                  ),
                },
                {
                  id: "attachments",
                  label: "Attachments",
                  count: attachments?.length ?? 0,
                  show: Boolean((attachments && attachments.length > 0) || attachmentError),
                  action: (
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
                        className="inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
                      >
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {uploadAttachment.isPending ? "Uploading…" : "Upload"}
                      </button>
                    </>
                  ),
                  render: () => (
                    <div className="space-y-3">
                      {attachmentError && (
                        <p className="font-mono text-[0.7rem] text-destructive">{attachmentError}</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(attachments ?? []).map((attachment) => (
                          <div key={attachment.id} className="border border-[var(--boared-rule)] p-2">
                            <div className="flex items-center justify-between gap-2">
                              <a
                                href={attachment.contentPath}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[0.78rem] text-[var(--boared-ink)] hover:underline truncate"
                                title={attachment.originalFilename ?? attachment.id}
                              >
                                {attachment.originalFilename ?? attachment.id}
                              </a>
                              <button
                                type="button"
                                className="text-[var(--boared-ink-faint)] hover:text-destructive transition-colors"
                                onClick={() => deleteAttachment.mutate(attachment.id)}
                                disabled={deleteAttachment.isPending}
                                title="Delete attachment"
                                aria-label="Delete attachment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-1">
                              {attachment.contentType} · {(attachment.byteSize / 1024).toFixed(1)} KB
                            </p>
                            {isImageAttachment(attachment) && (
                              <a href={attachment.contentPath} target="_blank" rel="noreferrer">
                                <img
                                  src={attachment.contentPath}
                                  alt={attachment.originalFilename ?? "attachment"}
                                  className="mt-2 max-h-56 border border-[var(--boared-rule)] object-contain bg-[var(--boared-paper-2)] w-full"
                                  loading="lazy"
                                />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </>
        }
        sidebar={
          <CaseSidebar
            issue={issue}
            agents={agents}
            projects={projects}
            activityCount={activity?.length ?? 0}
            costSummary={issueCostSummary}
            participants={<CaseParticipants synthesis={synthesis} />}
            recentActivity={<CaseRecentActivity synthesis={synthesis} />}
            onOpenProperties={() => setMobilePropsOpen(true)}
            primaryActions={
              <>
                {/* Pin / unpin toggle — keeps this case one click
                 * away in the sidebar quick-access strip. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    togglePin({
                      id: issue.id,
                      kind: "issue",
                      label: issue.title,
                      href: `/issues/${issue.identifier ?? issue.id}`,
                    })
                  }
                  className="w-full justify-start font-mono text-[0.66rem] uppercase tracking-[0.1em]"
                >
                  {isPinned(issue.id) ? "★ Pinned" : "☆ Pin this case"}
                </Button>
                {/* Planning-kind primary action: prominent CTA to
                 * finalise the plan into the backlog. Only shown
                 * when the plan hasn't already been transferred. */}
                {issue.kind === "planning" && !issue.transferredToBacklogAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={transferToBacklog.isPending}
                    onClick={() => transferToBacklog.mutate()}
                    className="w-full justify-start font-mono text-[0.66rem] uppercase tracking-[0.1em] border-[var(--boared-acid)]/70 text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/[0.08]"
                  >
                    <Inbox className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    {transferToBacklog.isPending
                      ? "Saving…"
                      : "Save plan to Backlog"}
                  </Button>
                )}
                {issue.kind === "planning" && issue.transferredToBacklogAt && (
                  <div className="w-full inline-flex items-center gap-1.5 px-2 py-1.5 font-mono text-[0.56rem] uppercase tracking-[0.16em] text-[var(--boared-success)] border border-[var(--boared-success)]/40 bg-[var(--boared-success)]/[0.04]">
                    <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                    Plan in Backlog ·{" "}
                    {relativeTime(issue.transferredToBacklogAt as unknown as string)}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={convertToWorkflow.isPending}
                  onClick={() => convertToWorkflow.mutate()}
                  className="w-full justify-start font-mono text-[0.66rem] uppercase tracking-[0.1em]"
                >
                  <Workflow className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {convertToWorkflow.isPending ? "Converting…" : "Convert to workflow"}
                </Button>
                {backlogEnabled && (
                  <SentToBacklogIndicator
                    source="issue"
                    sourceRefId={issue.id}
                    sourceRefType="issue"
                  />
                )}
              </>
            }
            moreActions={
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start font-mono text-[0.66rem] uppercase tracking-[0.1em] text-[var(--boared-ink-faint)]"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    More actions
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="end">
                  {backlogEnabled && (
                    <button
                      type="button"
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
                      <Inbox className="h-3 w-3" aria-hidden="true" />
                      Send to Backlog
                    </button>
                  )}
                  {backlogEnabled && issue.status !== "backlog" && (
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-foreground/[0.03]"
                      disabled={moveToBacklog.isPending}
                      onClick={() => {
                        moveToBacklog.mutate();
                        setMoreOpen(false);
                      }}
                    >
                      <Inbox className="h-3 w-3" aria-hidden="true" />
                      {moveToBacklog.isPending ? "Moving…" : "Move to Backlog"}
                    </button>
                  )}
                  {backlogEnabled &&
                    issue.status === "backlog" &&
                    linkedBacklog &&
                    linkedBacklog.length > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-foreground/[0.03]"
                        disabled={restoreFromBacklog.isPending}
                        onClick={() => {
                          const target = linkedBacklog[0];
                          if (!target) return;
                          restoreFromBacklog.mutate(target.id);
                          setMoreOpen(false);
                        }}
                      >
                        <Inbox className="h-3 w-3" aria-hidden="true" />
                        {restoreFromBacklog.isPending ? "Restoring…" : "Restore from Backlog"}
                      </button>
                    )}
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-foreground/[0.03] text-destructive"
                    onClick={() => {
                      updateIssue.mutate(
                        { hiddenAt: new Date().toISOString() },
                        { onSuccess: () => navigate("/issues/all") },
                      );
                      setMoreOpen(false);
                    }}
                  >
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                    Hide this case
                  </button>
                </PopoverContent>
              </Popover>
            }
          />
        }
      />

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

      {/* Keyboard cheat-sheet popover — toggled by `?` via the
       * useCaseKeyboardNav hook. Fixed-positioned; renders over
       * the whole page. */}
      <CaseKeyboardCheatSheet
        open={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />
    </IssueDetailShell>
    </IssueDetailActionsContext.Provider>
  );
}

/* Loading skeleton — matches the Dossier's hero shape so the page
 * doesn't thrash when the issue query resolves. Shimmer is
 * suppressed on prefers-reduced-motion via the CSS utility. */
function IssueDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-3 md:px-6 space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-3 w-28 bg-[var(--boared-rule)]/50" />
        <div className="h-10 w-3/4 bg-[var(--boared-rule)]/40" />
      </div>
      <div className="border border-[var(--boared-rule)] bg-[var(--boared-paper)]">
        <div className="p-4 space-y-3 border-b border-[var(--boared-rule)]">
          <div className="h-3 w-40 bg-[var(--boared-rule)]/50" />
          <div className="h-5 w-2/3 bg-[var(--boared-rule)]/40" />
          <div className="h-3 w-1/2 bg-[var(--boared-rule)]/40" />
        </div>
        <div className="p-4 space-y-2">
          <div className="h-16 bg-[var(--boared-rule)]/30" />
          <div className="h-16 bg-[var(--boared-rule)]/30" />
          <div className="h-16 bg-[var(--boared-rule)]/30" />
        </div>
        <div className="h-[140px] md:h-[260px] bg-[var(--boared-scene)]/80 border-t border-[var(--boared-rule)]" />
        <div className="h-12 border-t border-[var(--boared-rule)]/50 bg-[var(--boared-paper-2)]" />
      </div>
      <div className="mx-auto w-full max-w-[960px] space-y-3">
        <div className="h-4 w-24 bg-[var(--boared-rule)]/50" />
        <div className="h-3 w-full bg-[var(--boared-rule)]/30" />
        <div className="h-3 w-5/6 bg-[var(--boared-rule)]/30" />
        <div className="h-3 w-2/3 bg-[var(--boared-rule)]/30" />
      </div>
    </div>
  );
}

/* Actions the Dossier's next-action chip can invoke to jump the reader
 * to a relevant section. Replaces the paperclip:* window events that
 * the CaseCompanion used. Imperative, ref-stable, no DOM bridges. */
interface IssueDetailActions {
  expandApprovals: () => void;
  focusComposer: () => void;
}
const IssueDetailActionsContext =
  React.createContext<IssueDetailActions | null>(null);

function useIssueDetailActions(): IssueDetailActions | null {
  return React.useContext(IssueDetailActionsContext);
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
        {/* Unified page shell — responsive grid with a 1280 px hero
         * cap and a 960 px narrow reading column centred beneath.
         * Children opt into width by dropping their own max-w-*
         * and letting the shell own the layout. */}
        <div className="boared-reveal mx-auto w-full max-w-[1280px] px-3 md:px-6 space-y-6">
          {props.children}
        </div>
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

