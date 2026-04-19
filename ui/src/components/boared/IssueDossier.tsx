/**
 * IssueDossier — the hero block of IssueDetail.
 *
 *   ┌─ metrics strip (age · breakdown · thread · runs) ──┐
 *   │ phase pills (fly-camera shortcuts)                 │
 *   ├──────────────────────────┬─────────────────────────┤
 *   │                          │   context card          │
 *   │   ThoughtSpace (DAG)     │   (selected thought +   │
 *   │                          │    chain info +         │
 *   │                          │    "jump to in thread") │
 *   ├──────────────────────────┴─────────────────────────┤
 *   │ [▶ Walk me through]   ◆ next-action chip           │
 *   └────────────────────────────────────────────────────┘
 *
 * Storytelling is navigation-driven: hover a thought to trace its
 * causal chain (lives in IssueThoughtSpace); click to fly the camera
 * and open the context card. The tour button expresses the same story
 * as a guided sequence, using `narrative` + `chapters` + `tour` from
 * IssueDetail's existing data context. The next-action chip surfaces
 * whatever the narrative thinks you should do next.
 *
 * Clicking a thought in the 3D scene also scrolls the page to that
 * thought's DOM twin (#comment-{id}, or the SceneRow id for others),
 * so the abstract visualization stays grounded in the readable case
 * file below the Dossier.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  GitBranch,
  ListTree,
  Pause,
  Play,
  Radio,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../api/activity";
import { cn, relativeTime } from "../../lib/utils";
import {
  IssueThoughtSpace,
  type IssueThoughtSpaceHandle,
} from "./IssueThoughtSpace";

type Phase = "ancestors" | "anchor" | "subissues" | "motion";

/** Narrow slice of the `narrativeFor` return that the Dossier uses.
 * Keeps the Dossier decoupled from the full scene-narrative types. */
export interface DossierNarrative {
  nextAction?: {
    kind: string;
    label: string;
  } | null;
}

/** Narrow slice of the `useGuidedTour` return. */
export interface DossierTour {
  status: string;
  caption?: string | null;
  start: () => void;
  cancel: () => void;
}

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  /** From IssueDetailDataContext — drives the next-action chip. */
  narrative?: DossierNarrative | null;
  /** From IssueDetailDataContext — drives the Play-tour button. */
  tour?: DossierTour | null;
  /** Bridge to IssueDetail's existing handleNextAction (scroll +
   * expand + select). When absent the chip falls back to a scroll
   * to the comment composer. */
  onNextAction?: () => void;
  className?: string;
}

const DONE = new Set(["done", "cancelled"]);
const LIVE_RUN = new Set(["queued", "running", "in_progress"]);

const idComment = (id: string) => `comment:${id}`;
const idRun = (id: string) => `run:${id}`;
const idSub = (id: string) => `subissue:${id}`;
const idAnc = (id: string) => `ancestor:${id}`;
const idIssue = (id: string) => `issue:${id}`;

/** Map a thought-id to the DOM id of its case-file row. */
function domIdFor(thoughtId: string): string | null {
  if (thoughtId.startsWith("comment:")) {
    return `comment-${thoughtId.slice("comment:".length)}`;
  }
  // Sub-issues / activities / runs / approvals all get wrapped by
  // SceneRow using `id={node.id}` (raw, unprefixed).
  const colonIdx = thoughtId.indexOf(":");
  if (colonIdx > 0) return thoughtId.slice(colonIdx + 1);
  return null;
}

export function IssueDossier({
  issue,
  comments,
  activity: _activity,
  childIssues,
  linkedRuns,
  agentMap,
  narrative,
  tour,
  onNextAction,
  className,
}: Props) {
  const tsRef = useRef<IssueThoughtSpaceHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const kids = childIssues ?? [];
    const total = kids.length;
    const done = kids.filter((k) => DONE.has(k.status)).length;
    const liveRunCount = (linkedRuns ?? []).filter((r) => LIVE_RUN.has(r.status)).length;
    const commentCount = (comments ?? []).length;
    const ageMs = Date.now() - new Date(issue.createdAt).getTime();
    return { total, done, liveRunCount, commentCount, ageMs };
  }, [childIssues, linkedRuns, comments, issue.createdAt]);

  /* Per-kind lookups for the context card. Keeping these memoised
   * so the card doesn't re-derive them on every selection change. */
  const lookup = useMemo(() => {
    const commentsMap = new Map<string, IssueComment>();
    for (const c of comments ?? []) commentsMap.set(c.id, c);
    const runsMap = new Map<string, RunForIssue>();
    for (const r of linkedRuns ?? []) runsMap.set(r.runId, r);
    const subsMap = new Map<string, Issue>();
    for (const ch of childIssues ?? []) subsMap.set(ch.id, ch);
    return { commentsMap, runsMap, subsMap };
  }, [comments, linkedRuns, childIssues]);

  const onPhaseClick = useCallback(
    (phase: Phase) => {
      let targetId: string | null = null;
      switch (phase) {
        case "anchor":
          targetId = idIssue(issue.id);
          break;
        case "ancestors":
          if (issue.ancestors && issue.ancestors.length > 0) {
            // Nearest ancestor is the most useful entry point.
            targetId = idAnc(issue.ancestors[issue.ancestors.length - 1].id);
          }
          break;
        case "subissues":
          if (childIssues && childIssues.length > 0) targetId = idSub(childIssues[0].id);
          break;
        case "motion": {
          const live = (linkedRuns ?? []).find((r) => LIVE_RUN.has(r.status));
          if (live) targetId = idRun(live.runId);
          else {
            const newestComment = (comments ?? []).slice().sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )[0];
            if (newestComment) targetId = idComment(newestComment.id);
          }
          break;
        }
      }
      if (targetId) {
        setSelectedId(targetId);
        tsRef.current?.focusNodeId(targetId);
      }
    },
    [issue.id, issue.ancestors, childIssues, linkedRuns, comments],
  );

  /* Scene click → select + scroll to DOM twin. This is the bridge
   * that grounds the 3D scene in the case-file stack below. */
  const onNodeActivate = useCallback((thoughtId: string) => {
    setSelectedId(thoughtId);
    const domId = domIdFor(thoughtId);
    if (!domId) return;
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Trigger the SceneRow `data-pulse` flash that the case-file
    // components already style for "Companion jumped here".
    el.setAttribute("data-pulse", "true");
    window.setTimeout(() => el.removeAttribute("data-pulse"), 1200);
  }, []);

  const tourRunning = tour?.status === "running";
  const canTour = !!tour && !!narrative;

  return (
    <section
      className={cn(
        "relative border border-[var(--boared-rule)] bg-[#08080A] text-[#F2E6C4] overflow-hidden",
        className,
      )}
    >
      {/* Metrics strip — unchanged reads, compacter look. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-[var(--boared-rule)]/50">
        <Metric label="Age" value={formatAge(metrics.ageMs)} sub="since opened" />
        <Metric
          label="Breakdown"
          value={metrics.total > 0 ? `${metrics.done}/${metrics.total}` : "—"}
          sub={
            metrics.total === 0
              ? "no sub-matters"
              : metrics.total === metrics.done
                ? "all cleared"
                : `${metrics.total - metrics.done} open`
          }
        />
        <Metric
          label="Thread"
          value={String(metrics.commentCount)}
          sub={metrics.commentCount === 1 ? "comment" : "comments"}
        />
        <Metric
          label="Runs"
          value={
            metrics.liveRunCount > 0
              ? `${(linkedRuns ?? []).length} · ${metrics.liveRunCount} live`
              : String((linkedRuns ?? []).length)
          }
          sub={metrics.liveRunCount > 0 ? "live right now" : "logged"}
          live={metrics.liveRunCount > 0}
        />
      </div>

      {/* Phase pills — fly-camera shortcuts. No gating side-effect. */}
      <PhasePills
        onClick={onPhaseClick}
        counts={{
          ancestors: (issue.ancestors ?? []).length,
          anchor: 1,
          subissues: (childIssues ?? []).length,
          motion: (comments ?? []).length + (linkedRuns ?? []).length,
        }}
      />

      {/* Scene + context card. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_20rem] min-h-[clamp(520px,70vh,760px)]">
        <div className="relative border-b md:border-b-0 md:border-r border-[var(--boared-rule)]/50 min-h-[520px]">
          <IssueThoughtSpace
            ref={tsRef}
            issue={issue}
            comments={comments}
            activity={_activity}
            childIssues={childIssues}
            linkedRuns={linkedRuns}
            agentMap={agentMap}
            onNodeActivate={onNodeActivate}
            className="absolute inset-0"
          />
          {/* Tour caption chyron — bottom-centre of the canvas when
              a tour is running. Purely informational, doesn't block
              clicks. */}
          {tourRunning && tour?.caption && (
            <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 max-w-[80%] px-3 py-1.5 rounded-sm border border-[#F2E6C4]/40 bg-[#08080A]/80 backdrop-blur-sm font-serif italic text-[0.82rem] text-[#F2E6C4] text-center">
              {tour.caption}
            </div>
          )}
        </div>

        <ContextCard
          issue={issue}
          selectedId={selectedId}
          lookup={lookup}
          agentMap={agentMap}
          onJumpToTwin={() => {
            if (selectedId) onNodeActivate(selectedId);
          }}
        />
      </div>

      {/* Bottom bar: tour + next-action */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-[var(--boared-rule)]/50">
        <button
          type="button"
          disabled={!canTour}
          onClick={() => {
            if (!tour) return;
            if (tourRunning) tour.cancel();
            else tour.start();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] border transition-colors",
            tourRunning
              ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
              : "border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06]",
            !canTour && "opacity-40 cursor-not-allowed",
          )}
          title={canTour ? (tourRunning ? "Stop the tour" : "Walk me through this case") : undefined}
        >
          {tourRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {tourRunning ? "Stop tour" : "Walk me through"}
        </button>

        {narrative?.nextAction && (
          <button
            type="button"
            onClick={() => onNextAction?.()}
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[var(--boared-acid)]/70 text-[var(--boared-acid)] bg-[var(--boared-acid)]/[0.08] hover:bg-[var(--boared-acid)]/[0.18] transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            {narrative.nextAction.label}
          </button>
        )}
      </div>
    </section>
  );
}

/* ──────────────────── Subcomponents ────────────────── */

function Metric({
  label,
  value,
  sub,
  live,
}: {
  label: string;
  value: string;
  sub: string;
  live?: boolean;
}) {
  return (
    <div className="px-3 py-2 border-r last:border-r-0 border-[var(--boared-rule)]/50">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50]">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-serif italic text-[1.1rem] leading-none text-[#F2E6C4]">
          {value}
        </span>
        {live && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
          </span>
        )}
      </div>
      <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.1em] text-[#7A6F50]">
        {sub}
      </div>
    </div>
  );
}

function PhasePills({
  onClick,
  counts,
}: {
  onClick: (p: Phase) => void;
  counts: Record<Phase, number>;
}) {
  const rows: Array<{ id: Phase; label: string; Icon: typeof Target }> = [
    { id: "ancestors", label: "Upstream", Icon: GitBranch },
    { id: "anchor", label: "Anchor", Icon: Target },
    { id: "subissues", label: "Breakdown", Icon: ListTree },
    { id: "motion", label: "Motion", Icon: Radio },
  ];
  return (
    <nav
      aria-label="Jump the camera to a phase"
      className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-[var(--boared-rule)]/50"
    >
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50] mr-1">
        Jump to ▸
      </span>
      {rows.map((r) => {
        const available = counts[r.id] > 0 || r.id === "anchor";
        return (
          <button
            key={r.id}
            type="button"
            disabled={!available}
            onClick={() => available && onClick(r.id)}
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 border border-[#7A6F50]/50 font-mono text-[0.58rem] uppercase tracking-[0.12em] transition-colors",
              available
                ? "text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06] hover:border-[#F2E6C4]/70"
                : "text-[#F2E6C4]/30 cursor-default",
            )}
          >
            <r.Icon className="h-2.5 w-2.5" />
            {r.label}
            {r.id !== "anchor" && counts[r.id] > 0 && (
              <span className="ml-0.5 tabular-nums text-[#7A6F50]">{counts[r.id]}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function ContextCard({
  issue,
  selectedId,
  lookup,
  agentMap,
  onJumpToTwin,
}: {
  issue: Issue;
  selectedId: string | null;
  lookup: {
    commentsMap: Map<string, IssueComment>;
    runsMap: Map<string, RunForIssue>;
    subsMap: Map<string, Issue>;
  };
  agentMap: Map<string, Agent>;
  onJumpToTwin: () => void;
}) {
  /* Idle: a "where are we" read, not just a blank panel. */
  if (!selectedId) {
    return (
      <div className="flex flex-col p-4 gap-3 max-h-[clamp(520px,70vh,760px)] overflow-y-auto">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50]">
          Context
        </div>
        <div className="font-serif italic text-[0.95rem] leading-snug text-[#F2E6C4]">
          {issue.title}
        </div>
        <div className="text-[0.72rem] text-[#F2E6C4]/70 leading-snug">
          Hover a thought to trace its lineage; click one to fly the camera
          and see its full context here.
        </div>
      </div>
    );
  }

  let heading = "Thought";
  let kind = "thought";
  let author: string | null = null;
  let ts: number | null = null;
  let body: string | null = null;
  let badge: string | null = null;
  let canJump = false;

  if (selectedId.startsWith("comment:")) {
    const c = lookup.commentsMap.get(selectedId.slice("comment:".length));
    if (c) {
      heading = "Comment";
      kind = "comment";
      author = c.authorAgentId ? agentMap.get(c.authorAgentId)?.name ?? "—" : "—";
      ts = new Date(c.createdAt).getTime();
      body = c.body;
      canJump = true;
    }
  } else if (selectedId.startsWith("run:")) {
    const r = lookup.runsMap.get(selectedId.slice("run:".length));
    if (r) {
      heading = "Run";
      kind = "run";
      author = agentMap.get(r.agentId)?.name ?? "agent";
      ts = new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime();
      body = `status · ${r.status}${r.finishedAt ? ` · finished ${relativeTime(r.finishedAt)}` : ""}`;
      badge = LIVE_RUN.has(r.status) ? "live" : null;
      canJump = true;
    }
  } else if (selectedId.startsWith("subissue:")) {
    const s = lookup.subsMap.get(selectedId.slice("subissue:".length));
    if (s) {
      heading = "Sub-matter";
      kind = "subissue";
      author = s.assigneeAgentId ? agentMap.get(s.assigneeAgentId)?.name ?? "—" : null;
      ts = new Date(s.createdAt).getTime();
      body = `${s.identifier ?? s.id.slice(0, 6)} · ${s.title}`;
      badge = s.status;
      canJump = true;
    }
  } else if (selectedId.startsWith("ancestor:")) {
    heading = "Upstream";
    kind = "ancestor";
    const ancId = selectedId.slice("ancestor:".length);
    const anc = (issue.ancestors ?? []).find((a) => a.id === ancId);
    if (anc) {
      body = `${anc.identifier ?? ancId.slice(0, 6)} · ${anc.title}`;
    }
  } else if (selectedId.startsWith("issue:")) {
    heading = "Anchor";
    kind = "anchor";
    ts = new Date(issue.createdAt).getTime();
    body = issue.title;
    badge = issue.status;
  }

  return (
    <div className="flex flex-col max-h-[clamp(520px,70vh,760px)] overflow-y-auto">
      <div className="sticky top-0 z-10 px-3 py-2 border-b border-[var(--boared-rule)]/50 bg-[#08080A]/95 backdrop-blur-sm flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50]">
          {heading}
        </span>
        {badge && (
          <span
            className={cn(
              "font-mono text-[0.55rem] uppercase tracking-[0.12em]",
              badge === "live"
                ? "text-[var(--boared-acid)]"
                : "text-[#F2E6C4]/75",
            )}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {(author || ts) && (
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#7A6F50]">
            {author && <span className="text-[#F2E6C4]">{author}</span>}
            {ts && <span className="tabular-nums">{relativeTime(new Date(ts).toISOString())}</span>}
          </div>
        )}

        {body && (
          <div className="text-[0.82rem] leading-snug text-[#F2E6C4] whitespace-pre-wrap">
            {kind === "comment" ? body : <span className="italic">{body}</span>}
          </div>
        )}

        {canJump && (
          <button
            type="button"
            onClick={onJumpToTwin}
            className="self-start inline-flex items-center gap-1.5 h-7 px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06] transition-colors"
          >
            <ArrowDown className="h-3 w-3" />
            Jump to in thread
          </button>
        )}

        {/* Inline legend-style prompt for the next action on this
            thought type. Small but makes the panel feel alive. */}
        <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.1em] text-[#7A6F50]">
          {kind === "comment"
            ? "↑ upstream · ↓ downstream — trace via hover"
            : kind === "run"
              ? "belongs to this run"
              : kind === "subissue"
                ? "child of the anchor"
                : kind === "ancestor"
                  ? "upstream of the anchor"
                  : "the matter itself"}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── Utils ────────────────── */

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
