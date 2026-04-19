/**
 * IssueDossier — the hero block of IssueDetail.
 *
 * One unified 3D animated surface that tells the case's story through
 * navigation, not through a linear timeline control. The shape:
 *
 *   ┌─ metrics strip (age · breakdown · thread · runs) ──┐
 *   │ phase rail │   ThoughtSpace (DAG flow)             │
 *   │  (nav      │   · left-to-right causal depth axis   │ motion │
 *   │   only)    │   · hover/select → causal chain glows │ feed   │
 *   │            │   · brainwave pulses along edges      │        │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Storytelling is driven by exploration, not a play button: hover any
 * thought and its full upstream lineage + downstream consequences
 * light up (chain tracing lives inside IssueThoughtSpace). Clicking a
 * thought flies the camera to it. The phase rail and motion feed are
 * purely navigation aids — they fly the camera, no other state.
 *
 * The heavy-lifting visualisation (graph, layout, particles, camera,
 * chain trace) lives in IssueThoughtSpace. This wrapper owns layout
 * + the tiny navigation HUD.
 */

import { useCallback, useMemo, useRef } from "react";
import {
  ChevronRight,
  GitBranch,
  Layers,
  ListTree,
  MessageSquare,
  Radio,
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

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  className?: string;
}

interface FeedItem {
  id: string;
  kind: "comment" | "run";
  ts: number;
  label: string;
  authorName: string;
  isLive?: boolean;
}

const DONE = new Set(["done", "cancelled"]);
const LIVE_RUN = new Set(["queued", "running", "in_progress"]);

// ID helpers — must match the shape IssueThoughtSpace emits when it
// builds its internal thoughts[] array.
const idComment = (id: string) => `comment:${id}`;
const idRun = (id: string) => `run:${id}`;
const idSub = (id: string) => `subissue:${id}`;
const idAnc = (id: string) => `ancestor:${id}`;
const idIssue = (id: string) => `issue:${id}`;

export function IssueDossier({
  issue,
  comments,
  activity: _activity,
  childIssues,
  linkedRuns,
  agentMap,
  className,
}: Props) {
  const tsRef = useRef<IssueThoughtSpaceHandle>(null);

  const metrics = useMemo(() => {
    const kids = childIssues ?? [];
    const total = kids.length;
    const done = kids.filter((k) => DONE.has(k.status)).length;
    const liveRunCount = (linkedRuns ?? []).filter((r) => LIVE_RUN.has(r.status)).length;
    const commentCount = (comments ?? []).length;
    const ageMs = Date.now() - new Date(issue.createdAt).getTime();
    return { total, done, liveRunCount, commentCount, ageMs };
  }, [childIssues, linkedRuns, comments, issue.createdAt]);

  /* Motion feed — comments + runs, newest first. Click to fly camera. */
  const motionFeed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const c of comments ?? []) {
      const who = c.authorAgentId ? agentMap.get(c.authorAgentId)?.name ?? "—" : "—";
      out.push({
        id: idComment(c.id),
        kind: "comment",
        ts: new Date(c.createdAt).getTime(),
        label: c.body.replace(/\s+/g, " ").slice(0, 120),
        authorName: who,
      });
    }
    for (const r of linkedRuns ?? []) {
      const who = agentMap.get(r.agentId)?.name ?? "agent";
      out.push({
        id: idRun(r.runId),
        kind: "run",
        ts: new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime(),
        label: `${who} · ${r.status}`,
        authorName: who,
        isLive: LIVE_RUN.has(r.status),
      });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 40);
  }, [comments, linkedRuns, agentMap, issue.createdAt]);

  /* Phase click: navigation only — flies the camera to a representative
   * node in that cluster. No global dimming; the causal-chain dimming
   * happens inside ThoughtSpace when the user hovers or selects. */
  const onPhaseClick = useCallback(
    (phase: Phase) => {
      let targetId: string | null = null;
      switch (phase) {
        case "anchor":
          targetId = idIssue(issue.id);
          break;
        case "ancestors":
          if (issue.ancestors && issue.ancestors.length > 0) {
            // Nearest ancestor reads best first.
            targetId = idAnc(issue.ancestors[issue.ancestors.length - 1].id);
          }
          break;
        case "subissues":
          if (childIssues && childIssues.length > 0) targetId = idSub(childIssues[0].id);
          break;
        case "motion": {
          const live = (linkedRuns ?? []).find((r) => LIVE_RUN.has(r.status));
          if (live) targetId = idRun(live.runId);
          else if (motionFeed.length > 0) targetId = motionFeed[0].id;
          break;
        }
      }
      if (targetId) tsRef.current?.focusNodeId(targetId);
    },
    [issue.id, issue.ancestors, childIssues, linkedRuns, motionFeed],
  );

  const onMotionClick = useCallback((id: string) => {
    tsRef.current?.focusNodeId(id);
  }, []);

  return (
    <section
      className={cn(
        "relative border border-[var(--boared-rule)] bg-[#08080A] text-[#F2E6C4] overflow-hidden",
        className,
      )}
    >
      {/* Tiny informational strip — just enough to anchor the scene. */}
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

      {/* 3-column layout. Phase rail and motion feed are navigation
          shortcuts — neither drives global state beyond a camera fly. */}
      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr_20rem] min-h-[clamp(520px,68vh,720px)]">
        <PhaseRail
          onClick={onPhaseClick}
          counts={{
            ancestors: (issue.ancestors ?? []).length,
            anchor: 1,
            subissues: (childIssues ?? []).length,
            motion: (comments ?? []).length + (linkedRuns ?? []).length,
          }}
        />

        <div className="relative border-y md:border-y-0 md:border-x border-[var(--boared-rule)]/50 min-h-[520px]">
          <IssueThoughtSpace
            ref={tsRef}
            issue={issue}
            comments={comments}
            activity={_activity}
            childIssues={childIssues}
            linkedRuns={linkedRuns}
            agentMap={agentMap}
            className="absolute inset-0"
          />
          {/* Hint strip — explains the navigation-is-the-story idea
              so first-time users know what to do. Fades into the
              scene's own "drag · scroll · click" hint. */}
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-[#7A6F50]/80">
            hover a thought · trace its chain · click to fly
          </div>
        </div>

        <MotionFeed feed={motionFeed} onClick={onMotionClick} />
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

function PhaseRail({
  onClick,
  counts,
}: {
  onClick: (p: Phase) => void;
  counts: Record<Phase, number>;
}) {
  const rows: Array<{ id: Phase; label: string; hint: string; Icon: typeof Target }> = [
    { id: "ancestors", label: "Upstream", hint: "why this exists", Icon: GitBranch },
    { id: "anchor", label: "Anchor", hint: "the matter itself", Icon: Target },
    { id: "subissues", label: "Breakdown", hint: "sub-matters", Icon: ListTree },
    { id: "motion", label: "Motion", hint: "actions & thoughts", Icon: Radio },
  ];
  return (
    <nav
      aria-label="Navigate to a phase"
      className="flex md:flex-col border-b md:border-b-0 divide-x md:divide-x-0 md:divide-y divide-[var(--boared-rule)]/50"
    >
      {rows.map((r) => {
        const available = counts[r.id] > 0 || r.id === "anchor";
        return (
          <button
            key={r.id}
            type="button"
            disabled={!available}
            onClick={() => available && onClick(r.id)}
            title={available ? `Fly to ${r.label.toLowerCase()}` : undefined}
            className={cn(
              "flex-1 md:flex-initial flex md:flex-row items-start gap-2 px-3 py-3 text-left transition-colors",
              "text-[#F2E6C4]/70 hover:bg-[#F2E6C4]/[0.03] hover:text-[#F2E6C4]",
              !available && "opacity-40 cursor-default",
            )}
          >
            <r.Icon className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-[0.58rem] uppercase tracking-[0.14em]">
                {r.label}
              </div>
              <div className="mt-0.5 text-[0.68rem] text-[#7A6F50] leading-snug">
                {r.hint}
                {r.id !== "anchor" && counts[r.id] > 0 && (
                  <span className="ml-1 tabular-nums">· {counts[r.id]}</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function MotionFeed({
  feed,
  onClick,
}: {
  feed: FeedItem[];
  onClick: (id: string) => void;
}) {
  if (feed.length === 0) {
    return (
      <div className="hidden md:flex items-center justify-center p-4 text-center font-mono text-[0.65rem] text-[#7A6F50]">
        Nothing has happened yet.
      </div>
    );
  }
  return (
    <div className="max-h-[clamp(520px,68vh,720px)] overflow-y-auto">
      <div className="sticky top-0 z-10 px-3 py-2 border-b border-[var(--boared-rule)]/50 bg-[#08080A]/95 backdrop-blur-sm font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50]">
        Motion · newest first
      </div>
      <ul className="divide-y divide-[var(--boared-rule)]/30">
        {feed.map((b) => {
          const Icon = b.kind === "comment" ? MessageSquare : Layers;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onClick(b.id)}
                title="Fly camera to this thought"
                className="group w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[#F2E6C4]/[0.04] transition-colors"
              >
                <Icon className="h-3 w-3 mt-[4px] shrink-0 text-[#7A6F50] group-hover:text-[#F2E6C4]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-[#F2E6C4]">
                      {b.authorName}
                    </span>
                    {b.isLive && (
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[var(--boared-acid)]">
                        live
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[0.55rem] tabular-nums text-[#7A6F50] shrink-0">
                      {relativeTime(new Date(b.ts).toISOString())}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[0.72rem] text-[#F2E6C4]/85 leading-snug line-clamp-2">
                    {b.label}
                  </div>
                </div>
                <ChevronRight className="h-3 w-3 mt-[4px] shrink-0 text-[#7A6F50] opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </li>
          );
        })}
      </ul>
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
