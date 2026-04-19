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
 *   thread cards     ←  every comment/run/related case as a card
 *                       with author · role · quote · consequence
 *   open items       ←  live runs, open related cases
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

/** Role → paper-facing token. Resolved at render time via
 * `getComputedStyle`-free access (just inline as `var(--…)`). */
const ROLE_META: Record<
  ThreadEntryRole,
  { label: string; color: string; Icon: typeof Sparkles }
> = {
  opener: { label: "the opener", color: "var(--boared-feature)", Icon: Sparkles },
  decision: { label: "decision", color: "var(--boared-ink)", Icon: ListTree },
  approval: { label: "approved", color: "var(--boared-success)", Icon: CheckCircle2 },
  blocker: { label: "blocker", color: "var(--boared-live)", Icon: AlertCircle },
  question: { label: "question", color: "var(--boared-info)", Icon: HelpCircle },
  report: { label: "report", color: "var(--boared-warn)", Icon: MessageSquare },
  note: { label: "note", color: "var(--boared-ink-soft)", Icon: MessageSquare },
  run: { label: "run", color: "var(--boared-warn)", Icon: Radio },
  subissue: { label: "related case", color: "var(--boared-success)", Icon: Layers },
};

const STATUS_META: Record<string, { label: string; color: string; Icon: typeof Sparkles }> = {
  backlog: { label: "backlog", color: "var(--boared-mute)", Icon: CircleDashed },
  todo: { label: "to-do", color: "var(--boared-info)", Icon: Circle },
  in_progress: { label: "in progress", color: "var(--boared-warn)", Icon: Radio },
  in_review: { label: "in review", color: "var(--boared-review)", Icon: HelpCircle },
  blocked: { label: "blocked", color: "var(--boared-live)", Icon: AlertCircle },
  done: { label: "done", color: "var(--boared-success)", Icon: CheckCircle2 },
  cancelled: { label: "cancelled", color: "var(--boared-ink-faint)", Icon: CircleDashed },
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
        "flex flex-col min-h-0 bg-[var(--boared-paper)] text-[var(--boared-ink)]",
        className,
      )}
    >
      {/* ── Header ── */}
      <header className="px-4 py-3 border-b border-[var(--boared-rule)]">
        <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[var(--boared-ink-faint)]">
          <span>{issue.identifier ?? "the matter"}</span>
          <span aria-hidden="true">·</span>
          <span style={{ color: status.color }} className="inline-flex items-center gap-1">
            <status.Icon className="h-3 w-3" />
            {status.label}
          </span>
          <span aria-hidden="true">·</span>
          <span>{ageLabel}</span>
          <span aria-hidden="true">·</span>
          <span>
            {synthesis.participants.length} participant
            {synthesis.participants.length === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className="mt-1 font-serif italic text-[1.35rem] leading-tight text-[var(--boared-ink)]">
          {issue.title}
        </h2>
        <p className="mt-2 text-[0.85rem] leading-snug text-[var(--boared-ink-soft)]">
          {synthesis.headline}
        </p>
      </header>

      {/* ── Participants ── monogram + name + role. */}
      {synthesis.participants.length > 0 && (
        <div className="px-4 py-2 border-b border-[var(--boared-rule)]/60 flex flex-wrap gap-2">
          {synthesis.participants.map((p) => (
            <div
              key={p.id}
              className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
              title={`${PARTICIPANT_ROLE_LABEL[p.role]} · ${p.commentCount} comment${p.commentCount === 1 ? "" : "s"}${p.runCount > 0 ? ` · ${p.runCount} run${p.runCount === 1 ? "" : "s"}` : ""}${p.approvalCount > 0 ? ` · ${p.approvalCount} approval${p.approvalCount === 1 ? "" : "s"}` : ""}`}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center h-5 w-5 rounded-full font-mono text-[0.56rem] uppercase tracking-[0] text-[var(--boared-ink)]"
                style={{ background: monogramColor(p.id) }}
              >
                {monogram(p.name)}
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--boared-ink)]">
                {p.name}
              </span>
              <span className="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-[var(--boared-ink-faint)]">
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
        <div className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-1">
          Thread
          {synthesis.entries.length > 0 && (
            <span> · {synthesis.entries.length} entr{synthesis.entries.length === 1 ? "y" : "ies"}</span>
          )}
        </div>
        {synthesis.entries.length === 0 ? (
          <p className="font-serif italic text-[0.86rem] leading-relaxed text-[var(--boared-ink-soft)]">
            {emptyThreadProse(synthesis.participants[0]?.name)}
          </p>
        ) : (
          synthesis.entries.map((entry) => {
            const isReply = !!entry.replyToThoughtId &&
              synthesis.entries.some((e) => e.thoughtId === entry.replyToThoughtId);
            return (
              <ThreadCard
                key={entry.thoughtId}
                entry={entry}
                isActive={entry.thoughtId === selectedId}
                activeCardRef={activeCardRef}
                onSelect={onSelect}
                isReply={isReply}
              />
            );
          })
        )}
      </div>

      {/* ── Open items ── */}
      {(synthesis.openItems.liveRuns.length > 0 || synthesis.openItems.openSubs.length > 0) && (
        <div className="px-4 py-3 border-t border-[var(--boared-rule)]">
          <div className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
            Open
          </div>
          <ul className="flex flex-col gap-1.5">
            {synthesis.openItems.liveRuns.map((lr) => (
              <li
                key={`live-${lr.runId}`}
                className="flex items-center gap-2 text-[0.78rem] text-[var(--boared-ink)]"
              >
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-live)] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-live)]" />
                </span>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--boared-live)]">
                  {lr.agentName}
                </span>
                <span className="text-[var(--boared-ink-faint)]">· run {lr.status.replace(/_/g, " ")}</span>
              </li>
            ))}
            {synthesis.openItems.openSubs.map((s) => (
              <li
                key={`sub-${s.id}`}
                className="flex items-center gap-2 text-[0.78rem] text-[var(--boared-ink)]"
              >
                <Layers className="h-3 w-3 text-[var(--boared-success)]" />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em]">
                  {s.identifier ?? s.id.slice(0, 6)}
                </span>
                <span className="truncate">{s.title}</span>
                <span className="ml-auto font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[var(--boared-ink-faint)]">
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
  isReply,
}: {
  entry: ThreadEntry;
  isActive: boolean;
  activeCardRef: React.MutableRefObject<HTMLButtonElement | null>;
  onSelect: (thoughtId: string) => void;
  isReply: boolean;
}) {
  const meta = ROLE_META[entry.role];
  return (
    <button
      ref={isActive ? activeCardRef : null}
      type="button"
      onClick={() => onSelect(entry.thoughtId)}
      className={cn(
        "group text-left border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/25",
        "border-[var(--boared-rule)] bg-[var(--boared-paper)] hover:bg-[var(--boared-paper-2)]",
        isActive &&
          "border-[var(--boared-acid)]/70 bg-[var(--boared-paper-2)] shadow-[0_0_0_1px_var(--boared-acid)]",
        isReply && "ml-6 border-l-2 border-l-[var(--boared-rule)] relative",
      )}
      aria-pressed={isActive}
    >
      {isReply && (
        <span
          aria-hidden="true"
          className="absolute -left-6 top-3 w-5 border-t border-[var(--boared-rule)]"
        />
      )}
      <div className="flex items-center gap-2 px-3 pt-2">
        <span
          className="inline-flex items-center gap-1 h-4 px-1.5 font-mono text-[0.58rem] uppercase tracking-[0.14em]"
          style={{
            color: meta.color,
            borderColor: `color-mix(in oklab, ${meta.color} 55%, transparent)`,
            borderWidth: 1,
          }}
        >
          <meta.Icon className="h-2.5 w-2.5" />
          {meta.label}
        </span>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--boared-ink)]">
          {entry.authorName}
        </span>
        <span className="ml-auto font-mono text-[0.58rem] tabular-nums text-[var(--boared-ink-faint)]">
          {relativeTime(new Date(entry.ts).toISOString())}
        </span>
      </div>
      <div className="px-3 pt-1.5 pb-2">
        <p className="text-[0.85rem] leading-[1.4] text-[var(--boared-ink)]">
          {entry.kind === "comment" ? (
            <>
              <span className="font-serif italic text-[var(--boared-ink-faint)]">&ldquo;</span>
              {entry.quote}
              <span className="font-serif italic text-[var(--boared-ink-faint)]">&rdquo;</span>
            </>
          ) : (
            <span className="italic text-[var(--boared-ink-soft)]">{entry.quote}</span>
          )}
        </p>
        {entry.consequence && (
          <div className="mt-1 flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            <span aria-hidden="true">↳</span>
            <span>{entry.consequence}</span>
          </div>
        )}
      </div>
    </button>
  );
}

/* Monogram colour palette keyed by a stable hash of the participant
 * id so the same person always lights up the same chip. Uses the
 * existing status-tone tokens so colours stay on-brand. */
const MONOGRAM_TONES = [
  "color-mix(in oklab, var(--boared-feature) 30%, var(--boared-paper))",
  "color-mix(in oklab, var(--boared-info) 30%, var(--boared-paper))",
  "color-mix(in oklab, var(--boared-success) 30%, var(--boared-paper))",
  "color-mix(in oklab, var(--boared-review) 30%, var(--boared-paper))",
  "color-mix(in oklab, var(--boared-warn) 30%, var(--boared-paper))",
];

function monogramColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return MONOGRAM_TONES[Math.abs(h) % MONOGRAM_TONES.length];
}

function monogram(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function emptyThreadProse(firstParticipantName: string | undefined): string {
  if (firstParticipantName) return `${firstParticipantName} filed this. Nothing else yet.`;
  return "This case has just been filed. Nothing else yet.";
}
