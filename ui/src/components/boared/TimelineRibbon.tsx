/**
 * TimelineRibbon — horizontal scrub bar along the bottom of the
 * Dossier. The authoritative "where are we in the story" control.
 *
 * Rendered elements (left → right):
 *
 *   [▶/⏸]  ├──●───gap…───●────●────●────◆ now ──┤
 *          open      investig.  review resolved
 *
 *   · Calendar date ticks float above the axis.
 *   · Chapter pins below with labels.
 *   · A draggable scrub thumb (●) is the currentTime marker.
 *   · The "now" end cap pulses when there's live activity.
 *
 * Owns zero story state — it's a pure view of the props it's given.
 * The Dossier owns currentTime + isPlaying and updates them.
 */

import { useCallback, useMemo, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TimeMap } from "./thoughtSpace/timeMap";
import type { Chapter, ChapterKind } from "./thoughtSpace/chapterDetect";

interface Props {
  timeMap: TimeMap;
  chapters: Chapter[];
  currentTime: number;
  isPlaying: boolean;
  /** True when the issue has a live run — the "now" cap pulses. */
  liveNow?: boolean;
  onScrub: (ts: number) => void;
  onPlayToggle: () => void;
  className?: string;
}

const CHAPTER_COLORS: Record<ChapterKind, string> = {
  opened: "#C8A96E",
  triaged: "#F2E6C4",
  investigated: "#5CC8E4",
  reviewed: "#A36ADE",
  blocked: "#E04444",
  resolved: "#3FCF8E",
};

export function TimelineRibbon({
  timeMap,
  chapters,
  currentTime,
  isPlaying,
  liveNow,
  onScrub,
  onPlayToggle,
  className,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const fromClientX = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return timeMap.minTs;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = x / rect.width;
      return timeMap.fromX(pct);
    },
    [timeMap],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onScrub(fromClientX(e.clientX));
    },
    [fromClientX, onScrub],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!(e.buttons & 1)) return;
      onScrub(fromClientX(e.clientX));
    },
    [fromClientX, onScrub],
  );

  /* Calendar ticks — spaced so they're readable at any scale.
   * Picks a stride that gives roughly 6–9 labels across the axis. */
  const ticks = useMemo(() => {
    const spanMs = timeMap.maxTs - timeMap.minTs;
    if (spanMs <= 0) return [];
    const strides: Array<{ ms: number; label: (d: Date) => string }> = [
      { ms: 5 * 60 * 1000, label: (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      { ms: 60 * 60 * 1000, label: (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      { ms: 6 * 60 * 60 * 1000, label: (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      { ms: 24 * 60 * 60 * 1000, label: (d) => d.toLocaleDateString([], { month: "short", day: "numeric" }) },
      { ms: 7 * 24 * 60 * 60 * 1000, label: (d) => d.toLocaleDateString([], { month: "short", day: "numeric" }) },
      { ms: 30 * 24 * 60 * 60 * 1000, label: (d) => d.toLocaleDateString([], { month: "short", year: "2-digit" }) },
    ];
    const targetCount = 7;
    const ideal = spanMs / targetCount;
    const stride = strides.reduce((best, s) => (Math.abs(s.ms - ideal) < Math.abs(best.ms - ideal) ? s : best));
    const out: Array<{ x: number; label: string }> = [];
    const first = Math.ceil(timeMap.minTs / stride.ms) * stride.ms;
    for (let ts = first; ts <= timeMap.maxTs; ts += stride.ms) {
      out.push({ x: timeMap.toX(ts), label: stride.label(new Date(ts)) });
    }
    return out;
  }, [timeMap]);

  const thumbX = timeMap.toX(currentTime);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-t border-[var(--boared-rule)]/50 bg-[#08080A]",
        className,
      )}
    >
      <button
        type="button"
        onClick={onPlayToggle}
        className="inline-flex items-center justify-center h-8 w-8 border border-[#7A6F50]/60 text-[#F2E6C4] hover:bg-[#F2E6C4]/[0.06]"
        title={isPlaying ? "Pause the replay" : "Replay the story"}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <div className="flex-1 relative min-h-[46px]">
        {/* Calendar tick labels above the track. */}
        <div className="absolute inset-x-0 top-0 h-3 pointer-events-none">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[#7A6F50] -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${t.x * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>

        {/* The scrub track itself. */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="absolute inset-x-0 top-[16px] h-[18px] cursor-pointer"
          aria-label="Story timeline"
          role="slider"
          aria-valuemin={timeMap.minTs}
          aria-valuemax={timeMap.maxTs}
          aria-valuenow={currentTime}
        >
          {/* Baseline hairline */}
          <span
            aria-hidden="true"
            className="absolute left-0 right-0 top-[9px] h-[1px]"
            style={{ background: "var(--boared-rule)" }}
          />

          {/* Compressed-gap indicators */}
          {timeMap.gaps.map((g, i) => (
            <span
              key={`g-${i}`}
              aria-hidden="true"
              className="absolute top-[6px] h-[7px] font-mono text-[0.55rem] text-[#7A6F50]/70 -translate-x-1/2"
              style={{ left: `${g.atX * 100}%` }}
            >
              ···
            </span>
          ))}

          {/* Filled portion up to currentTime */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-[9px] h-[1px]"
            style={{
              width: `${thumbX * 100}%`,
              background: "var(--boared-acid)",
              boxShadow: "0 0 6px var(--boared-acid)",
            }}
          />

          {/* Chapter pins */}
          {chapters.map((c) => {
            const x = timeMap.toX(c.ts);
            const color = CHAPTER_COLORS[c.kind];
            const hit = c.ts <= currentTime;
            return (
              <button
                key={`${c.kind}-${c.ts}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onScrub(c.ts);
                }}
                className="group absolute top-[4px] -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-auto"
                style={{ left: `${x * 100}%` }}
                title={`${c.label} · ${new Date(c.ts).toLocaleString()}`}
              >
                <span
                  className="h-[11px] w-[11px] rounded-full border"
                  style={{
                    borderColor: color,
                    background: hit ? color : "transparent",
                    boxShadow: hit ? `0 0 6px ${color}` : "none",
                  }}
                />
                <span
                  className="font-mono text-[0.48rem] uppercase tracking-[0.14em] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                  style={{ color }}
                >
                  {c.label}
                </span>
              </button>
            );
          })}

          {/* Current-time thumb */}
          <span
            aria-hidden="true"
            className="absolute top-[6px] -translate-x-1/2 h-[8px] w-[8px] rounded-full pointer-events-none"
            style={{
              left: `${thumbX * 100}%`,
              background: "var(--boared-acid)",
              boxShadow: "0 0 10px var(--boared-acid)",
            }}
          />
        </div>

        {/* "Now" end cap */}
        <span
          aria-hidden="true"
          className="absolute right-0 top-[14px] -translate-x-full flex items-center gap-1 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[#7A6F50]"
        >
          {liveNow && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
            </span>
          )}
          now
        </span>
      </div>

      <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-[#7A6F50] tabular-nums min-w-[10ch] text-right">
        {formatReadableTime(currentTime)}
      </div>
    </div>
  );
}

function formatReadableTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const delta = now - ts;
  if (delta < 60 * 60 * 1000) {
    const mins = Math.round(delta / (60 * 1000));
    return mins <= 1 ? "just now" : `${mins}m ago`;
  }
  if (delta < 24 * 60 * 60 * 1000) {
    const hrs = Math.round(delta / (60 * 60 * 1000));
    return `${hrs}h ago`;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
