/**
 * IssueDossier — the hero block of IssueDetail.
 *
 *   ┌─ CaseSummary (primary reading surface) ────────────────────┐
 *   │  title · status · headline prose                            │
 *   │  participants                                               │
 *   │  thread cards (all comments/runs/subs, with roles+quotes)   │
 *   │  open items                                                 │
 *   ├─ 3D chronicle (visual support) ────────────────────────────┤
 *   │  ThoughtSpace — calendar-time X axis                        │
 *   ├─ TimelineRibbon ───────────────────────────────────────────┤
 *   │  [▶] ├─●─···─●──●──●────●─◆─┤ 4d ago                        │
 *   │ ◆ next-action chip                                          │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The goal of this surface is to let the user understand an issue
 * faster and with more clarity than scrolling its comment thread.
 * The CaseSummary synthesises everything into scannable cards with
 * roles, real quotes, and consequence tags; the 3D chronicle lives
 * below as supporting visual that plays the same story in motion.
 *
 * Selection is shared: clicking a thread card scrubs the ribbon +
 * flies the 3D camera; clicking a thought in 3D (or auto-feature
 * during replay) highlights + scrolls to the matching card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../api/activity";
import { cn } from "../../lib/utils";
import {
  IssueThoughtSpace,
  type IssueThoughtSpaceHandle,
} from "./IssueThoughtSpace";
import { buildTimeMap } from "./thoughtSpace/timeMap";
import { detectChapters, type Chapter } from "./thoughtSpace/chapterDetect";
import { TimelineRibbon } from "./TimelineRibbon";
import { CaseSummary } from "./CaseSummary";

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
      // Clear any lingering in-scene selection so the context card
      // and chain trace follow the new time-front instead of
      // sticking on the previously-clicked thought. Also nudges
      // ThoughtSpace's selectedId to null so cam.userControlled
      // resets and the time-follow gate re-opens.
      setSelectedId(null);
      tsRef.current?.focusNodeId(null);
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

  /* Ribbon needs a single flag for its "now" pulse. Full per-metric
   * breakdown now lives in CaseSummary's header line. */
  const liveNow = useMemo(
    () => (linkedRuns ?? []).some((r) => LIVE_RUN.has(r.status)),
    [linkedRuns],
  );

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
      {/* ── Primary reading surface. Everything useful lives here:
            synthetic summary, the thread as cards with roles and
            real quotes, participants, open items. The old metrics
            strip is gone — its numbers are now part of the summary
            header and the open-items tail. */}
      <div className="min-h-[380px] max-h-[min(60vh,640px)] flex flex-col">
        <CaseSummary
          issue={issue}
          comments={comments}
          activity={activity}
          childIssues={childIssues}
          linkedRuns={linkedRuns}
          agentMap={agentMap}
          selectedId={selectedId}
          onSelect={(id) => {
            // Clicking a card is equivalent to activating in the
            // scene: scrub the ribbon to its ts and fly the camera.
            onNodeActivate(id);
            tsRef.current?.focusNodeId(id);
          }}
          className="flex-1 min-h-0"
        />
      </div>

      {/* ── 3D chronicle (visual support). Same data, in motion —
            lets the viewer *feel* the pace, hover thoughts for the
            causal chain, and watch the case resolve. Smaller
            height than before so it no longer dominates the
            surface. */}
      <div className="relative border-t border-[var(--boared-rule)]/50" style={{ height: 420 }}>
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
        {/* Chapter title card overlay — fires when replay crosses
            a chapter boundary. */}
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
              style={{ fontSize: "clamp(1.2rem, 3vw, 2rem)" }}
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
        {showEndSummary && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto text-center px-5 py-4 border border-[var(--boared-rule)]/60 bg-[#08080A]/85 backdrop-blur-sm">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-[#7A6F50]">
                End of chronicle · {isResolved ? (issue.status === "cancelled" ? "Cancelled" : "Resolved") : "Caught up"}
              </div>
              <button
                type="button"
                onClick={onPlayToggle}
                className="mt-2 inline-flex items-center gap-1.5 h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06] transition-colors"
              >
                ↻ Replay the chronicle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── TimelineRibbon ── the authoritative scrub + play. */}
      <TimelineRibbon
        timeMap={timeMap}
        chapters={chapters}
        currentTime={currentTime}
        isPlaying={isPlaying}
        liveNow={liveNow}
        onScrub={onScrub}
        onPlayToggle={onPlayToggle}
      />

      {/* ── Next-action chip. */}
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

