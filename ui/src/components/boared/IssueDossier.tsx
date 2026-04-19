/**
 * IssueDossier — the hero block of IssueDetail.
 *
 *   ┌─ metrics strip (age · breakdown · thread · runs) ──────────┐
 *   ├─────────────────────────────┬──────────────────────────────┤
 *   │                             │  Context card / End summary  │
 *   │   ThoughtSpace (chronicle)  │  (selected thought · chain   │
 *   │   · X = calendar time       │   info · jump to thread)     │
 *   │   · events arrive at their  │                              │
 *   │     real ts during replay   │                              │
 *   │   · beacon at resolution    │                              │
 *   ├─────────────────────────────┴──────────────────────────────┤
 *   │ [▶]  ├─●─···─●──●──●────●─◆─┤ 4d 3h ago                    │
 *   │          open   tri   inv   rev  resolved                  │
 *   │ ◆ next-action chip (when narrative has one)                │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The scene is a chronicle, not a DAG. Events are placed on a
 * calendar-time X axis (compressed over dormant gaps). The Dossier
 * owns `currentTime` — on mount it auto-plays from issue creation
 * to now over ~30 s, then parks. Dragging the TimelineRibbon scrubs
 * through; clicking a thought flies the camera to it AND sets
 * currentTime to that thought's timestamp.
 *
 * Chapter title cards fade in at each chapter boundary during
 * replay. An end-state summary card renders when currentTime hits
 * the end and the case is resolved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Sparkles } from "lucide-react";
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
import { buildTimeMap } from "./thoughtSpace/timeMap";
import { detectChapters, type Chapter } from "./thoughtSpace/chapterDetect";
import { TimelineRibbon } from "./TimelineRibbon";

/** Narrow slice of `narrativeFor` output the Dossier consumes. */
export interface DossierNarrative {
  lede?: string | null;
  nextAction?: {
    kind: string;
    label: string;
  } | null;
}

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  narrative?: DossierNarrative | null;
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

/** Map thought-id to DOM-id for the scroll bridge below. */
function domIdFor(thoughtId: string): string | null {
  if (thoughtId.startsWith("comment:")) {
    return `comment-${thoughtId.slice("comment:".length)}`;
  }
  const colonIdx = thoughtId.indexOf(":");
  if (colonIdx > 0) return thoughtId.slice(colonIdx + 1);
  return null;
}

const REPLAY_DURATION_MS = 30_000;
const CHAPTER_CARD_VISIBLE_MS = 2400;

export function IssueDossier({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  narrative,
  onNextAction,
  className,
}: Props) {
  const tsRef = useRef<IssueThoughtSpaceHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── Time map ── all event timestamps compressed into [0, 1]. */
  const timeMap = useMemo(() => {
    const tss: number[] = [new Date(issue.createdAt).getTime()];
    for (const c of comments ?? []) tss.push(new Date(c.createdAt).getTime());
    for (const r of linkedRuns ?? []) {
      tss.push(new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime());
    }
    for (const ch of childIssues ?? []) tss.push(new Date(ch.createdAt).getTime());
    for (const e of activity ?? []) tss.push(new Date(e.createdAt).getTime());
    // Extend to "now" (or resolution) so the axis always runs to present.
    const resolvedAt = issue.completedAt ?? issue.cancelledAt ?? null;
    tss.push(resolvedAt ? new Date(resolvedAt as unknown as string | Date).getTime() : Date.now());
    return buildTimeMap(tss);
  }, [issue, comments, linkedRuns, childIssues, activity]);

  /* ── Chapters ── auto-detected lifecycle beats. */
  const chapters = useMemo(
    () => detectChapters({ issue, comments, activity, linkedRuns }),
    [issue, comments, activity, linkedRuns],
  );

  /* ── Replay clock ── Dossier owns currentTime. Starts at minTs
   * (case creation) on mount and animates to maxTs over REPLAY_DURATION.
   * User can scrub / click thoughts / press pause at any point. */
  const [currentTime, setCurrentTime] = useState<number>(timeMap.minTs);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const replayStartRef = useRef<number>(performance.now());
  const replayFromTsRef = useRef<number>(timeMap.minTs);

  // Re-start replay whenever the time map identity changes (new
  // issue loaded or new event arrived).
  useEffect(() => {
    setCurrentTime(timeMap.minTs);
    setIsPlaying(true);
    replayStartRef.current = performance.now();
    replayFromTsRef.current = timeMap.minTs;
  }, [timeMap.minTs, timeMap.maxTs]);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentTime >= timeMap.maxTs) {
      setIsPlaying(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - replayStartRef.current;
      const fromTs = replayFromTsRef.current;
      const span = timeMap.maxTs - fromTs;
      if (span <= 0) {
        setCurrentTime(timeMap.maxTs);
        setIsPlaying(false);
        return;
      }
      // Duration scales proportionally with how much of the axis
      // remains: jumping to mid-replay and hitting play still takes
      // the remaining half-duration.
      const fractionRemaining = span / Math.max(1, timeMap.maxTs - timeMap.minTs);
      const dur = Math.max(4000, REPLAY_DURATION_MS * fractionRemaining);
      const t = Math.min(1, elapsed / dur);
      const next = fromTs + span * t;
      setCurrentTime(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setIsPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, timeMap.minTs, timeMap.maxTs, currentTime]);

  const onPlayToggle = useCallback(() => {
    setIsPlaying((p) => {
      if (!p) {
        // If we're at the end, start fresh from the beginning.
        const startFrom = currentTime >= timeMap.maxTs - 1 ? timeMap.minTs : currentTime;
        setCurrentTime(startFrom);
        replayStartRef.current = performance.now();
        replayFromTsRef.current = startFrom;
      }
      return !p;
    });
  }, [currentTime, timeMap.minTs, timeMap.maxTs]);

  const onScrub = useCallback(
    (ts: number) => {
      setIsPlaying(false);
      setCurrentTime(Math.max(timeMap.minTs, Math.min(timeMap.maxTs, ts)));
    },
    [timeMap.minTs, timeMap.maxTs],
  );

  /* ── Chapter title card ── appears when the replay crosses a
   * chapter boundary. Tracks last-seen chapter index so it fires
   * once per chapter per replay pass. */
  const [chapterCard, setChapterCard] = useState<Chapter | null>(null);
  const lastChapterIdxRef = useRef<number>(-1);
  useEffect(() => {
    if (!isPlaying) return;
    // Find the chapter whose ts just passed `currentTime` (within 500ms).
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      if (c.ts > currentTime) break;
      if (i > lastChapterIdxRef.current && currentTime - c.ts < 500) {
        lastChapterIdxRef.current = i;
        setChapterCard(c);
        const timer = window.setTimeout(
          () => setChapterCard((prev) => (prev === c ? null : prev)),
          CHAPTER_CARD_VISIBLE_MS,
        );
        return () => window.clearTimeout(timer);
      }
    }
    return;
  }, [currentTime, chapters, isPlaying]);
  useEffect(() => {
    // Reset chapter tracking when replay restarts.
    if (currentTime <= timeMap.minTs + 50) {
      lastChapterIdxRef.current = -1;
      setChapterCard(null);
    }
  }, [currentTime, timeMap.minTs]);

  /* ── Metrics (unchanged reads). */
  const metrics = useMemo(() => {
    const kids = childIssues ?? [];
    const total = kids.length;
    const done = kids.filter((k) => DONE.has(k.status)).length;
    const liveRunCount = (linkedRuns ?? []).filter((r) => LIVE_RUN.has(r.status)).length;
    const commentCount = (comments ?? []).length;
    const ageMs = Date.now() - new Date(issue.createdAt).getTime();
    return { total, done, liveRunCount, commentCount, ageMs };
  }, [childIssues, linkedRuns, comments, issue.createdAt]);

  /* ── Context card lookups. */
  const lookup = useMemo(() => {
    const commentsMap = new Map<string, IssueComment>();
    for (const c of comments ?? []) commentsMap.set(c.id, c);
    const runsMap = new Map<string, RunForIssue>();
    for (const r of linkedRuns ?? []) runsMap.set(r.runId, r);
    const subsMap = new Map<string, Issue>();
    for (const ch of childIssues ?? []) subsMap.set(ch.id, ch);
    return { commentsMap, runsMap, subsMap };
  }, [comments, linkedRuns, childIssues]);

  /* ── Interactions ── click flies + scrubs to that event; scrolls
   * DOM to the twin. Tour feature (called by ThoughtSpace during
   * replay) updates the context card only. */
  const onNodeActivate = useCallback(
    (thoughtId: string) => {
      setSelectedId(thoughtId);
      setIsPlaying(false);
      // Seek to this thought's timestamp so the scene state matches
      // what the user just inspected.
      const bucket = thoughtId.split(":")[0];
      const raw = thoughtId.slice(bucket.length + 1);
      let ts: number | null = null;
      if (bucket === "comment") {
        const c = lookup.commentsMap.get(raw);
        if (c) ts = new Date(c.createdAt).getTime();
      } else if (bucket === "run") {
        const r = lookup.runsMap.get(raw);
        if (r) ts = new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime();
      } else if (bucket === "subissue") {
        const s = lookup.subsMap.get(raw);
        if (s) ts = new Date(s.createdAt).getTime();
      } else if (bucket === "issue") {
        ts = new Date(issue.createdAt).getTime();
      } else if (bucket === "ancestor") {
        // Ancestors don't exist on the main time axis; skip scrub.
      }
      if (ts !== null) setCurrentTime(Math.max(timeMap.minTs, Math.min(timeMap.maxTs, ts)));

      const domId = domIdFor(thoughtId);
      if (!domId) return;
      const el = document.getElementById(domId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-pulse", "true");
      window.setTimeout(() => el.removeAttribute("data-pulse"), 1200);
    },
    [lookup, issue.createdAt, timeMap.minTs, timeMap.maxTs],
  );

  const onNodeFeature = useCallback((thoughtId: string | null) => {
    setSelectedId(thoughtId);
  }, []);

  const liveNow = metrics.liveRunCount > 0;
  const isAtEnd = currentTime >= timeMap.maxTs - 1;
  const isResolved = issue.status === "done" || issue.status === "cancelled";
  const showEndSummary = !isPlaying && isAtEnd && !selectedId;

  return (
    <section
      className={cn(
        "relative border border-[var(--boared-rule)] bg-[#08080A] text-[#F2E6C4] overflow-hidden",
        className,
      )}
    >
      {/* Metrics strip. */}
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

      {/* Scene + context card. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_20rem] min-h-[clamp(520px,70vh,760px)]">
        <div className="relative border-b md:border-b-0 md:border-r border-[var(--boared-rule)]/50 min-h-[520px]">
          <IssueThoughtSpace
            ref={tsRef}
            issue={issue}
            comments={comments}
            activity={activity}
            childIssues={childIssues}
            linkedRuns={linkedRuns}
            agentMap={agentMap}
            onNodeActivate={onNodeActivate}
            onNodeFeature={onNodeFeature}
            timeMap={timeMap}
            currentTime={currentTime}
            className="absolute inset-0"
          />
          {/* Chapter title card overlay — lives over the scene,
              fires when the replay crosses a chapter boundary. */}
          {chapterCard && (
            <div
              className="pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 max-w-[80%] text-center"
              style={{ color: "#F2E6C4" }}
            >
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] mb-1 text-[#7A6F50]">
                {issue.identifier ?? "case"} · chapter
              </div>
              <div
                className="font-serif italic leading-[1.1] animate-chapter-fade"
                style={{ fontSize: "clamp(1.4rem, 3.6vw, 2.4rem)" }}
              >
                {chapterCard.label}
              </div>
              <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-[#7A6F50]">
                {new Date(chapterCard.ts).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}{" "}
                ·{" "}
                {new Date(chapterCard.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}
          {/* Lede / opening headline — shown as a soft header above
              the scene only when replay is at the very start. */}
          {isPlaying &&
            currentTime <= timeMap.minTs + (timeMap.maxTs - timeMap.minTs) * 0.02 &&
            (narrative?.lede?.trim() || issue.title) && (
              <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 max-w-[80%] text-center animate-chapter-fade">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] mb-1 text-[#7A6F50]">
                  {issue.identifier ?? "the matter"} · dossier
                </div>
                <div
                  className="font-serif italic leading-[1.1] text-[#F2E6C4]"
                  style={{ fontSize: "clamp(1.25rem, 3vw, 2rem)" }}
                >
                  {narrative?.lede?.trim() || issue.title}
                </div>
              </div>
            )}
        </div>

        {showEndSummary ? (
          <EndStateSummary
            issue={issue}
            comments={comments}
            linkedRuns={linkedRuns}
            agentMap={agentMap}
            childIssues={childIssues}
            isResolved={isResolved}
            onReplay={onPlayToggle}
          />
        ) : (
          <ContextCard
            issue={issue}
            selectedId={selectedId}
            lookup={lookup}
            agentMap={agentMap}
            onJumpToTwin={() => {
              if (selectedId) onNodeActivate(selectedId);
            }}
          />
        )}
      </div>

      {/* TimelineRibbon — the primary narrative control. */}
      <TimelineRibbon
        timeMap={timeMap}
        chapters={chapters}
        currentTime={currentTime}
        isPlaying={isPlaying}
        liveNow={liveNow}
        onScrub={onScrub}
        onPlayToggle={onPlayToggle}
      />

      {/* Next-action chip — when narrative knows what to do next. */}
      {narrative?.nextAction && (
        <div className="flex items-center justify-end px-3 py-2 border-t border-[var(--boared-rule)]/30">
          <button
            type="button"
            onClick={() => onNextAction?.()}
            className="inline-flex items-center gap-1.5 h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[var(--boared-acid)]/70 text-[var(--boared-acid)] bg-[var(--boared-acid)]/[0.08] hover:bg-[var(--boared-acid)]/[0.18] transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            {narrative.nextAction.label}
          </button>
        </div>
      )}

      {/* Local keyframe for the chapter-card fade. Keeping it inline
          so the animation stays colocated with the component. */}
      <style>{`
        @keyframes dossier-chapter-fade {
          0% { opacity: 0; transform: translate(-50%, 6px); }
          10% { opacity: 1; transform: translate(-50%, 0); }
          80% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -4px); }
        }
        .animate-chapter-fade {
          animation: dossier-chapter-fade ${CHAPTER_CARD_VISIBLE_MS}ms ease-out forwards;
        }
      `}</style>
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
          Watch the chronicle play, or drag the timeline to any moment. Click a
          thought to read its context here.
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

function EndStateSummary({
  issue,
  comments,
  linkedRuns,
  agentMap,
  childIssues,
  isResolved,
  onReplay,
}: {
  issue: Issue;
  comments?: IssueComment[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  childIssues?: Issue[];
  isResolved: boolean;
  onReplay: () => void;
}) {
  const startTs = new Date(issue.createdAt).getTime();
  const endTs = new Date(
    (issue.completedAt ?? issue.cancelledAt ?? Date.now()) as unknown as string | Date,
  ).getTime();
  const durationMs = Math.max(0, endTs - startTs);
  const commentCount = (comments ?? []).length;
  const runCount = (linkedRuns ?? []).length;
  const subCount = (childIssues ?? []).length;

  const uniqueAgents = new Set<string>();
  for (const c of comments ?? []) if (c.authorAgentId) uniqueAgents.add(c.authorAgentId);
  for (const r of linkedRuns ?? []) uniqueAgents.add(r.agentId);
  const agentNames = [...uniqueAgents]
    .map((id) => agentMap.get(id)?.name)
    .filter((n): n is string => !!n);

  const verdict = isResolved
    ? issue.status === "cancelled"
      ? "Cancelled"
      : "Resolved"
    : "Still open";

  return (
    <div className="flex flex-col max-h-[clamp(520px,70vh,760px)] overflow-y-auto p-4 gap-3">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-[#7A6F50]">
        End of chronicle · {verdict}
      </div>
      <div className="font-serif italic text-[1.1rem] leading-[1.2] text-[#F2E6C4]">
        {issue.title}
      </div>

      <dl className="grid grid-cols-2 gap-y-2 gap-x-3 mt-1 font-mono text-[0.65rem]">
        <SummaryStat label="Duration" value={formatDuration(durationMs)} />
        <SummaryStat label="Thoughts" value={String(commentCount + runCount + subCount)} />
        <SummaryStat label="Comments" value={String(commentCount)} />
        <SummaryStat label="Runs" value={String(runCount)} />
        <SummaryStat label="Sub-matters" value={String(subCount)} />
        <SummaryStat
          label="Agents"
          value={String(uniqueAgents.size)}
          hint={agentNames.slice(0, 2).join(" · ")}
        />
      </dl>

      <button
        type="button"
        onClick={onReplay}
        className="mt-2 self-start inline-flex items-center gap-1.5 h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06] transition-colors"
      >
        ↻ Replay the chronicle
      </button>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.5rem] uppercase tracking-[0.18em] text-[#7A6F50]">{label}</dt>
      <dd className="font-serif italic text-[0.95rem] text-[#F2E6C4]">{value}</dd>
      {hint && (
        <dd className="text-[0.56rem] uppercase tracking-[0.1em] text-[#7A6F50] truncate">
          {hint}
        </dd>
      )}
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

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hrem = h % 24;
  return hrem > 0 ? `${d}d ${hrem}h` : `${d}d`;
}
