/**
 * IssueDossier — the hero block of IssueDetail.
 *
 * One unified surface that merges the old pair (IssueScene +
 * IssueCaseMap) into a single animated experience:
 *
 *   ┌─ metrics strip (age · breakdown · thread · runs live) ─┐
 *   │                                                        │
 *   │  ┌ Phase ┬──── IssueThoughtSpace (3D) ───┬ Motion ┐    │
 *   │  │  rail │                               │  feed  │    │
 *   │  │       │   particles, causal edges,    │        │    │
 *   │  │       │   nodes, camera orbit         │ click  │    │
 *   │  │       │                               │ → fly  │    │
 *   │  └───────┴───────────────────────────────┴────────┘    │
 *   │                                                        │
 *   │  ◀────────●────────────▶   [▶ play]   "just now"       │
 *   └────────────────────────────────────────────────────────┘
 *
 * - Phase rail: click a phase to focus its cluster. The camera flies
 *   to a representative node; everything outside the phase fades to
 *   ~10 %. Click again to clear.
 * - Scrubber: event-weighted (each comment/run/activity/subissue is
 *   one beat). Dragging left hides later beats (they fade to ~5 %);
 *   Play auto-advances over ~20 s telling the story forward.
 * - Motion feed: the case's comments + runs newest-first. Click an
 *   entry and the camera flies to that node in 3D.
 *
 * The heavy-lifting visualization (graph / particles / camera) lives
 * in IssueThoughtSpace. This wrapper only owns layout + state and
 * drives the graph through its gateById map and focusNodeId ref.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  Clock,
  GitBranch,
  Layers,
  ListTree,
  MessageSquare,
  Pause,
  Play,
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

interface Beat {
  id: string;
  kind: "comment" | "run" | "subissue" | "activity";
  ts: number;
  label: string;
  authorName: string;
  isLive?: boolean;
}

const DONE = new Set(["done", "cancelled"]);
const LIVE_RUN = new Set(["queued", "running", "in_progress"]);

/* ──────────────────── ID helpers (must match ThoughtSpace) ────────────────── */

function tsIdComment(id: string) { return `comment:${id}`; }
function tsIdRun(id: string)     { return `run:${id}`; }
function tsIdSub(id: string)     { return `subissue:${id}`; }
function tsIdAct(id: string)     { return `activity:${id}`; }
function tsIdAnc(id: string)     { return `ancestor:${id}`; }
function tsIdIssue(id: string)   { return `issue:${id}`; }

function phaseOf(id: string): Phase {
  if (id.startsWith("ancestor:")) return "ancestors";
  if (id.startsWith("issue:")) return "anchor";
  if (id.startsWith("subissue:")) return "subissues";
  // comment / run / activity all count as motion
  return "motion";
}

/* ──────────────────── Component ────────────────── */

export function IssueDossier({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  className,
}: Props) {
  const tsRef = useRef<IssueThoughtSpaceHandle>(null);
  const [focusedPhase, setFocusedPhase] = useState<Phase | null>(null);

  /* Metrics — mirrors the old IssueCaseMap tiles so the reads match. */
  const metrics = useMemo(() => {
    const kids = childIssues ?? [];
    const total = kids.length;
    const done = kids.filter((k) => DONE.has(k.status)).length;
    const liveRunCount = (linkedRuns ?? []).filter((r) => LIVE_RUN.has(r.status)).length;
    const commentCount = (comments ?? []).length;
    const createdMs = new Date(issue.createdAt).getTime();
    const ageMs = Date.now() - createdMs;
    return { total, done, liveRunCount, commentCount, ageMs };
  }, [childIssues, linkedRuns, comments, issue.createdAt]);

  /* Beats — every event as one tick; scrubber is event-weighted. */
  const beats = useMemo<Beat[]>(() => {
    const out: Beat[] = [];
    for (const c of comments ?? []) {
      const who = c.authorAgentId ? agentMap.get(c.authorAgentId)?.name ?? "—" : "—";
      out.push({
        id: tsIdComment(c.id),
        kind: "comment",
        ts: new Date(c.createdAt).getTime(),
        label: c.body.replace(/\s+/g, " ").slice(0, 120),
        authorName: who,
      });
    }
    for (const r of linkedRuns ?? []) {
      const who = agentMap.get(r.agentId)?.name ?? "agent";
      out.push({
        id: tsIdRun(r.runId),
        kind: "run",
        ts: new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime(),
        label: `${who} · ${r.status}`,
        authorName: who,
        isLive: LIVE_RUN.has(r.status),
      });
    }
    for (const ch of childIssues ?? []) {
      out.push({
        id: tsIdSub(ch.id),
        kind: "subissue",
        ts: new Date(ch.createdAt).getTime(),
        label: `${ch.identifier ?? ch.id.slice(0, 6)} · ${ch.title}`,
        authorName: ch.assigneeAgentId
          ? agentMap.get(ch.assigneeAgentId)?.name ?? "—"
          : "—",
      });
    }
    for (const e of activity ?? []) {
      if (e.action === "issue.comment_added") continue;
      const who = e.agentId ? agentMap.get(e.agentId)?.name ?? "—" : "system";
      out.push({
        id: tsIdAct(e.id),
        kind: "activity",
        ts: new Date(e.createdAt).getTime(),
        label: `${who} ${e.action.replace(/^issue\./, "").replace(/_/g, " ")}`,
        authorName: who,
      });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }, [comments, linkedRuns, childIssues, activity, agentMap, issue.createdAt]);

  const [scrubberIdx, setScrubberIdx] = useState<number>(beats.length);
  const [isPlaying, setIsPlaying] = useState(false);

  /* Keep the scrubber parked at the end when new beats arrive (so the
   * page doesn't quietly hide new events). If the user dragged it
   * back, stay there until they release. */
  const wasAtEndRef = useRef(true);
  useEffect(() => {
    if (wasAtEndRef.current) setScrubberIdx(beats.length);
  }, [beats.length]);
  useEffect(() => {
    wasAtEndRef.current = scrubberIdx >= beats.length;
  }, [scrubberIdx, beats.length]);

  /* Play: advance one beat per (duration / beats). ~1.5s + 600ms per
   * beat, capped at 30s so gigantic issues don't hang forever. */
  useEffect(() => {
    if (!isPlaying || beats.length === 0) return;
    const startIdx = 0;
    const start = performance.now();
    const durMs = Math.min(30_000, 1500 + beats.length * 600);
    setScrubberIdx(startIdx);
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durMs);
      const next = Math.round(startIdx + t * (beats.length - startIdx));
      setScrubberIdx(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setIsPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, beats.length]);

  /* Motion feed — newest first, capped. */
  const motionFeed = useMemo<Beat[]>(
    () => beats.filter((b) => b.kind !== "subissue").slice().reverse().slice(0, 30),
    [beats],
  );

  /* gateById — the per-node opacity map that drives scrubber + focus.
   * Recompute when any input changes; ThoughtSpace does a
   * ref-equality check in its memo comparator, so allocating a fresh
   * Map here is fine. */
  const gateById = useMemo(() => {
    const map = new Map<string, number>();
    const scrubCutoffTs =
      scrubberIdx >= beats.length
        ? Number.POSITIVE_INFINITY
        : beats[scrubberIdx]?.ts ?? Number.POSITIVE_INFINITY;

    const set = (id: string, ts: number) => {
      let g = 1;
      if (ts > scrubCutoffTs) g *= 0.05;
      if (focusedPhase && phaseOf(id) !== focusedPhase) g *= 0.1;
      map.set(id, g);
    };

    // Anchor + ancestors are "before time" for the scrubber — always
    // visible (they're context, not events in the story).
    map.set(tsIdIssue(issue.id), focusedPhase && focusedPhase !== "anchor" ? 0.1 : 1);
    (issue.ancestors ?? []).forEach((a) => {
      map.set(tsIdAnc(a.id), focusedPhase && focusedPhase !== "ancestors" ? 0.1 : 1);
    });

    for (const c of comments ?? []) set(tsIdComment(c.id), new Date(c.createdAt).getTime());
    for (const r of linkedRuns ?? [])
      set(tsIdRun(r.runId), new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime());
    for (const ch of childIssues ?? []) set(tsIdSub(ch.id), new Date(ch.createdAt).getTime());
    for (const e of activity ?? []) {
      if (e.action === "issue.comment_added") continue;
      set(tsIdAct(e.id), new Date(e.createdAt).getTime());
    }
    return map;
  }, [
    issue,
    comments,
    activity,
    childIssues,
    linkedRuns,
    scrubberIdx,
    beats,
    focusedPhase,
  ]);

  /* Phase click: toggle focus + fly camera to a representative node. */
  const onPhaseClick = useCallback(
    (phase: Phase) => {
      setFocusedPhase((prev) => (prev === phase ? null : phase));
      let targetId: string | null = null;
      switch (phase) {
        case "anchor":
          targetId = tsIdIssue(issue.id);
          break;
        case "ancestors":
          if (issue.ancestors && issue.ancestors.length > 0)
            targetId = tsIdAnc(issue.ancestors[0].id);
          break;
        case "subissues":
          if (childIssues && childIssues.length > 0)
            targetId = tsIdSub(childIssues[0].id);
          break;
        case "motion":
          // Pick the newest live run first, else newest comment.
          const live = (linkedRuns ?? []).find((r) => LIVE_RUN.has(r.status));
          if (live) targetId = tsIdRun(live.runId);
          else if (motionFeed.length > 0) targetId = motionFeed[0].id;
          break;
      }
      if (targetId) tsRef.current?.focusNodeId(targetId);
    },
    [issue.id, issue.ancestors, childIssues, linkedRuns, motionFeed],
  );

  const onMotionClick = useCallback((id: string) => {
    tsRef.current?.focusNodeId(id);
  }, []);

  const scrubLabel = useMemo(() => {
    if (scrubberIdx >= beats.length) return "all events";
    if (scrubberIdx === 0) return "start";
    const b = beats[Math.max(0, scrubberIdx - 1)];
    return b ? relativeTime(new Date(b.ts).toISOString()) : "…";
  }, [beats, scrubberIdx]);

  return (
    <section
      className={cn(
        "relative border border-[var(--boared-rule)] bg-[#08080A] text-[#F2E6C4] overflow-hidden",
        className,
      )}
    >
      {/* ── Metrics strip ─────────────────────────────────────────── */}
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

      {/* ── 3-column layout: phase rail | scene | motion feed ─────── */}
      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr_20rem] min-h-[clamp(480px,62vh,640px)]">
        <PhaseRail
          focused={focusedPhase}
          onClick={onPhaseClick}
          counts={{
            ancestors: (issue.ancestors ?? []).length,
            anchor: 1,
            subissues: (childIssues ?? []).length,
            motion: (comments ?? []).length + (linkedRuns ?? []).length,
          }}
        />

        <div className="relative border-y md:border-y-0 md:border-x border-[var(--boared-rule)]/50 min-h-[480px]">
          <IssueThoughtSpace
            ref={tsRef}
            issue={issue}
            comments={comments}
            activity={activity}
            childIssues={childIssues}
            linkedRuns={linkedRuns}
            agentMap={agentMap}
            gateById={gateById}
            className="absolute inset-0"
          />
        </div>

        <MotionFeed feed={motionFeed} onClick={onMotionClick} />
      </div>

      {/* ── Scrubber ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--boared-rule)]/50">
        <button
          type="button"
          onClick={() => {
            if (scrubberIdx >= beats.length) setScrubberIdx(0);
            setIsPlaying((v) => !v);
          }}
          disabled={beats.length === 0}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06] disabled:opacity-40"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {isPlaying ? "Pause" : "Play story"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, beats.length)}
          step={1}
          value={scrubberIdx}
          onChange={(e) => {
            if (isPlaying) setIsPlaying(false);
            setScrubberIdx(Number(e.target.value));
          }}
          aria-label="Story scrubber"
          className="flex-1 accent-[var(--boared-acid)] cursor-pointer"
        />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#7A6F50] tabular-nums min-w-[8ch] text-right">
          {scrubLabel}
        </span>
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
  focused,
  onClick,
  counts,
}: {
  focused: Phase | null;
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
      aria-label="Phases of the case"
      className="flex md:flex-col border-b md:border-b-0 divide-x md:divide-x-0 md:divide-y divide-[var(--boared-rule)]/50"
    >
      {rows.map((r) => {
        const active = focused === r.id;
        const available = counts[r.id] > 0 || r.id === "anchor";
        return (
          <button
            key={r.id}
            type="button"
            disabled={!available}
            aria-pressed={active}
            onClick={() => available && onClick(r.id)}
            className={cn(
              "flex-1 md:flex-initial flex md:flex-row items-start gap-2 px-3 py-3 text-left transition-colors",
              active
                ? "bg-[#F2E6C4]/[0.07] text-[#F2E6C4]"
                : "text-[#F2E6C4]/70 hover:bg-[#F2E6C4]/[0.03] hover:text-[#F2E6C4]",
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
  feed: Beat[];
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
    <div className="max-h-[clamp(480px,62vh,640px)] overflow-y-auto">
      <div className="sticky top-0 z-10 px-3 py-2 border-b border-[var(--boared-rule)]/50 bg-[#08080A]/95 backdrop-blur-sm font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[#7A6F50]">
        Motion · newest first
      </div>
      <ul className="divide-y divide-[var(--boared-rule)]/30">
        {feed.map((b) => {
          const Icon =
            b.kind === "comment"
              ? MessageSquare
              : b.kind === "run"
                ? Layers
                : Clock;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onClick(b.id)}
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
