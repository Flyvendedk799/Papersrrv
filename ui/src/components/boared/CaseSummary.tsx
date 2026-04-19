/**
 * CaseSummary — the Dossier's reading surface. Turns a raw issue +
 * events into a scannable, summarised view that lets the user
 * understand what happened in seconds instead of scrolling through
 * a comment thread.
 *
 * Layout:
 *
 *   header           ←  title · status · age · participants count
 *   headline prose   ←  1-2 sentence synthetic summary
 *   participants row ←  chips by role + contribution counts
 *   thread cards     ←  every comment/run/sub-matter as a card
 *                       with author · role · quote · consequence
 *   open items       ←  live runs, open sub-matters
 *
 * During replay or selection the matching card auto-highlights +
 * scrolls into view so the panel stays in lock-step with the 3D
 * scene below.
 */

import {
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleDashed,
  HelpCircle,
  Layers,
  ListTree,
  MessageSquare,
  Radio,
  Sparkles,
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
  synthesiseThread,
  type ThreadEntry,
  type ThreadEntryRole,
  type Participant,
} from "./thoughtSpace/threadSynth";

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  /** ID of the currently featured / selected thought (scene or
   * manual click). The matching card gets the active treatment. */
  selectedId: string | null;
  /** Click handler — tells the Dossier which thought-id the user
   * tapped so it can scrub the ribbon + fly the 3D camera. */
  onSelect: (thoughtId: string) => void;
  className?: string;
}

const ROLE_META: Record<
  ThreadEntryRole,
  { label: string; color: string; Icon: typeof Sparkles }
> = {
  opener: { label: "the opener", color: "#C8A96E", Icon: Sparkles },
  decision: { label: "decision", color: "#F2E6C4", Icon: ListTree },
  approval: { label: "approved", color: "#3FCF8E", Icon: CheckCircle2 },
  blocker: { label: "blocker", color: "#E04444", Icon: AlertCircle },
  question: { label: "question", color: "#5CC8E4", Icon: HelpCircle },
  report: { label: "report", color: "#E09437", Icon: MessageSquare },
  note: { label: "note", color: "#F2E6C4", Icon: MessageSquare },
  run: { label: "run", color: "#E09437", Icon: Radio },
  subissue: { label: "sub-matter", color: "#3FCF8E", Icon: Layers },
};

const STATUS_META: Record<string, { label: string; color: string; Icon: typeof Sparkles }> = {
  backlog: { label: "backlog", color: "#8B8FA3", Icon: CircleDashed },
  todo: { label: "to-do", color: "#5CC8E4", Icon: Circle },
  in_progress: { label: "in progress", color: "#E09437", Icon: Radio },
  in_review: { label: "in review", color: "#A36ADE", Icon: HelpCircle },
  blocked: { label: "blocked", color: "#E04444", Icon: AlertCircle },
  done: { label: "done", color: "#3FCF8E", Icon: CheckCircle2 },
  cancelled: { label: "cancelled", color: "#6B6B6B", Icon: CircleDashed },
};

const PARTICIPANT_ROLE_LABEL: Record<Participant["role"], string> = {
  reporter: "reporter",
  investigator: "investigator",
  reviewer: "reviewer",
  contributor: "contributor",
};

export function CaseSummary({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  selectedId,
  onSelect,
  className,
}: Props) {
  const synthesis = useMemo(
    () => synthesiseThread({ issue, comments, activity, childIssues, linkedRuns, agentMap }),
    [issue, comments, activity, childIssues, linkedRuns, agentMap],
  );

  const status = STATUS_META[issue.status] ?? STATUS_META.backlog;
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  const ageLabel = ageDays === 0 ? "today" : ageDays === 1 ? "1 day" : `${ageDays} days`;

  /* Auto-scroll the active card into view when the selection
   * changes (e.g. replay features a new thought). */
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeCardRef.current;
    if (!el) return;
    // Only scroll if the card is partially out of view — avoids
    // fighting the user's own scroll.
    const rect = el.getBoundingClientRect();
    const parent = el.closest("[data-thread-scroll]") as HTMLElement | null;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    if (rect.top < pr.top + 20 || rect.bottom > pr.bottom - 20) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  return (
    <section
      className={cn(
        "flex flex-col min-h-0 bg-[#0A0A0C] text-[#F2E6C4]",
        className,
      )}
    >
      {/* ── Header ── */}
      <header className="px-4 py-3 border-b border-[var(--boared-rule)]/50">
        <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-[#7A6F50]">
          <span>{issue.identifier ?? "the matter"}</span>
          <span>·</span>
          <span style={{ color: status.color }} className="inline-flex items-center gap-1">
            <status.Icon className="h-3 w-3" />
            {status.label}
          </span>
          <span>·</span>
          <span>{ageLabel}</span>
          <span>·</span>
          <span>
            {synthesis.participants.length} participant
            {synthesis.participants.length === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className="mt-1 font-serif italic text-[1.25rem] leading-tight text-[#F2E6C4]">
          {issue.title}
        </h2>
        <p className="mt-2 text-[0.8rem] leading-snug text-[#F2E6C4]/80">
          {synthesis.headline}
        </p>
      </header>

      {/* ── Participants ── */}
      {synthesis.participants.length > 0 && (
        <div className="px-4 py-2 border-b border-[var(--boared-rule)]/30 flex flex-wrap gap-2">
          {synthesis.participants.map((p) => (
            <div
              key={p.id}
              className="inline-flex items-center gap-1.5 h-6 px-2 border border-[#7A6F50]/50"
              title={`${PARTICIPANT_ROLE_LABEL[p.role]} · ${p.commentCount} comment${p.commentCount === 1 ? "" : "s"}${p.runCount > 0 ? ` · ${p.runCount} run${p.runCount === 1 ? "" : "s"}` : ""}${p.approvalCount > 0 ? ` · ${p.approvalCount} approval${p.approvalCount === 1 ? "" : "s"}` : ""}`}
            >
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[#F2E6C4]">
                {p.name}
              </span>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[#7A6F50]">
                {PARTICIPANT_ROLE_LABEL[p.role]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Thread cards ── */}
      <div
        data-thread-scroll
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
      >
        <div className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[#7A6F50] mb-1">
          Thread
          {synthesis.entries.length > 0 && (
            <span> · {synthesis.entries.length} entr{synthesis.entries.length === 1 ? "y" : "ies"}</span>
          )}
        </div>
        {synthesis.entries.length === 0 ? (
          <p className="text-[0.72rem] text-[#7A6F50]">
            Nothing has happened yet. When this case gets comments, runs, or
            sub-matters, they'll land here with quotes and roles so you can
            scan what happened fast.
          </p>
        ) : (
          synthesis.entries.map((entry) => (
            <ThreadCard
              key={entry.thoughtId}
              entry={entry}
              isActive={entry.thoughtId === selectedId}
              activeCardRef={activeCardRef}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* ── Open items ── */}
      {(synthesis.openItems.liveRuns.length > 0 || synthesis.openItems.openSubs.length > 0) && (
        <div className="px-4 py-3 border-t border-[var(--boared-rule)]/50">
          <div className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[#7A6F50] mb-2">
            Open
          </div>
          <ul className="flex flex-col gap-1.5">
            {synthesis.openItems.liveRuns.map((lr) => (
              <li
                key={`live-${lr.runId}`}
                className="flex items-center gap-2 text-[0.72rem] text-[#F2E6C4]/90"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
                </span>
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--boared-acid)]">
                  {lr.agentName}
                </span>
                <span className="text-[#7A6F50]">· run {lr.status.replace(/_/g, " ")}</span>
              </li>
            ))}
            {synthesis.openItems.openSubs.map((s) => (
              <li
                key={`sub-${s.id}`}
                className="flex items-center gap-2 text-[0.72rem] text-[#F2E6C4]/90"
              >
                <Layers className="h-3 w-3 text-[#3FCF8E]" />
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em]">
                  {s.identifier ?? s.id.slice(0, 6)}
                </span>
                <span className="truncate">{s.title}</span>
                <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[#7A6F50]">
                  {s.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ThreadCard({
  entry,
  isActive,
  activeCardRef,
  onSelect,
}: {
  entry: ThreadEntry;
  isActive: boolean;
  activeCardRef: React.MutableRefObject<HTMLButtonElement | null>;
  onSelect: (thoughtId: string) => void;
}) {
  const meta = ROLE_META[entry.role];
  return (
    <button
      ref={isActive ? activeCardRef : null}
      type="button"
      onClick={() => onSelect(entry.thoughtId)}
      className={cn(
        "group text-left border transition-all",
        "border-[var(--boared-rule)]/40 bg-[#0E0E10] hover:bg-[#131315]",
        isActive && "border-[var(--boared-acid)]/70 bg-[#131315] shadow-[0_0_0_1px_rgba(255,107,74,0.35)]",
      )}
      aria-pressed={isActive}
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <span
          className="inline-flex items-center gap-1 h-4 px-1.5 font-mono text-[0.52rem] uppercase tracking-[0.14em]"
          style={{
            color: meta.color,
            borderColor: `${meta.color}66`,
            borderWidth: 1,
          }}
        >
          <meta.Icon className="h-2.5 w-2.5" />
          {meta.label}
        </span>
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[#F2E6C4]">
          {entry.authorName}
        </span>
        <span className="ml-auto font-mono text-[0.55rem] tabular-nums text-[#7A6F50]">
          {relativeTime(new Date(entry.ts).toISOString())}
        </span>
      </div>
      <div className="px-3 pt-1.5 pb-2">
        <p className="text-[0.78rem] leading-[1.35] text-[#F2E6C4]/90">
          {entry.kind === "comment" ? (
            <>
              <span className="font-serif italic text-[#F2E6C4]/60">&ldquo;</span>
              {entry.quote}
              <span className="font-serif italic text-[#F2E6C4]/60">&rdquo;</span>
            </>
          ) : (
            <span className="italic">{entry.quote}</span>
          )}
        </p>
        {entry.consequence && (
          <div className="mt-1 flex items-center gap-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-[#7A6F50]">
            <span>↳</span>
            <span>{entry.consequence}</span>
          </div>
        )}
      </div>
    </button>
  );
}
