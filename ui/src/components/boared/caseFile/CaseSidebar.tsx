/**
 * CaseSidebar — margin annotations on the case file.
 *
 * Visual: paper strip pinned to the right of the main document,
 * kept narrow so it reads as a margin, not as a second column.
 * Each group is separated by an ornamental rule. Copy reads
 * editorial — "Opened by · Claude" not "assignee: claude".
 */

import { Link } from "react-router-dom";
import {
  Inbox,
  MoreHorizontal,
  Workflow,
} from "lucide-react";
import type { Agent, Issue, Project } from "@paperclipai/shared";
import { cn, relativeTime } from "../../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Identity } from "../../Identity";
import { OrnamentalRule } from "./OrnamentalRule";

interface Props {
  issue: Issue;
  agents: Agent[] | undefined;
  projects: Project[] | undefined;
  activityCount: number;
  costSummary: {
    hasCost: boolean;
    hasTokens: boolean;
    cost: number;
    totalTokens: number;
  };
  /** Renderable participants roster — typically a `<CaseParticipants>`.
   * Slotted in so the sidebar doesn't need to know about synthesis. */
  participants?: React.ReactNode;
  /** Recent-activity feed — typically a `<CaseRecentActivity>`. */
  recentActivity?: React.ReactNode;
  primaryActions?: React.ReactNode;
  moreActions?: React.ReactNode;
  onOpenProperties: () => void;
  className?: string;
}

export function CaseSidebar({
  issue,
  agents,
  projects,
  activityCount,
  costSummary,
  participants,
  recentActivity,
  primaryActions,
  moreActions,
  onOpenProperties,
  className,
}: Props) {
  const assignee = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const project = issue.projectId
    ? projects?.find((p) => p.id === issue.projectId)
    : null;

  return (
    <div
      className={cn(
        "border border-[var(--boared-rule)] bg-[var(--boared-paper)] relative",
        // Tape-at-the-top detail — a tiny "washi tape" strip to
        // make it feel pinned. Purely decorative.
        "before:absolute before:-top-[6px] before:left-6 before:right-6 before:h-[8px]",
        "before:bg-[var(--boared-acid)]/15 before:border-[var(--boared-acid)]/30 before:border-t before:border-b",
        "before:rotate-[-0.6deg]",
        className,
      )}
    >
      <div className="p-4 pt-5 space-y-4">
        <Annotation label="In hand of">
          {assignee ? (
            <div className="flex items-center gap-2">
              <Identity name={assignee.name} size="sm" />
              <span className="text-[0.9rem] text-[var(--boared-ink)] font-serif italic">
                {assignee.name}
              </span>
            </div>
          ) : issue.assigneeUserId ? (
            <span className="text-[0.9rem] text-[var(--boared-ink)] font-serif italic">
              {issue.assigneeUserId}
            </span>
          ) : (
            <Whisper>nobody yet</Whisper>
          )}
        </Annotation>

        <Annotation label="Filed under">
          {project ? (
            <Link
              to={`/projects/${project.id}`}
              className="inline-flex items-center gap-2 text-[0.9rem] font-serif italic text-[var(--boared-ink)] no-underline hover:text-[var(--boared-acid)] transition-colors"
            >
              <span
                className="inline-block w-2 h-2 shrink-0"
                style={{ background: project.color ?? "var(--boared-ink-soft)" }}
                aria-hidden="true"
              />
              {project.name}
            </Link>
          ) : (
            <Whisper>no project</Whisper>
          )}
        </Annotation>

        {(issue.labels ?? []).length > 0 && (
          <Annotation label="Tagged">
            <div className="flex flex-wrap gap-1">
              {(issue.labels ?? []).map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 h-5 px-1.5 font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[var(--boared-ink)] border border-[var(--boared-rule)]"
                >
                  <span
                    className="inline-block w-1.5 h-1.5"
                    style={{ background: l.color }}
                    aria-hidden="true"
                  />
                  {l.name}
                </span>
              ))}
            </div>
          </Annotation>
        )}

        {participants && (
          <>
            <OrnamentalRule ornament="❦" className="py-0.5" />
            {participants}
          </>
        )}

        {recentActivity && (
          <>
            <OrnamentalRule ornament="❦" className="py-0.5" />
            {recentActivity}
          </>
        )}

        <OrnamentalRule ornament="❦" className="py-0.5" />

        {/* Dates — phrased like ledger entries */}
        <div className="space-y-1.5">
          <DateLine label="Opened" value={issue.createdAt} />
          {issue.startedAt && <DateLine label="Started" value={issue.startedAt} />}
          {issue.completedAt && <DateLine label="Resolved" value={issue.completedAt} />}
          {issue.cancelledAt && <DateLine label="Dropped" value={issue.cancelledAt} />}
          <DateLine label="Last touched" value={issue.updatedAt} />
        </div>

        {(activityCount > 0 || costSummary.hasCost || costSummary.hasTokens) && (
          <OrnamentalRule ornament="❦" className="py-0.5" />
        )}

        {activityCount > 0 && (
          <Annotation label="Ledger">
            <a
              href="#chapter-work"
              className="font-serif italic text-[0.9rem] text-[var(--boared-ink)] no-underline hover:text-[var(--boared-acid)] transition-colors"
            >
              {activityCount} {activityCount === 1 ? "entry" : "entries"} · view log
            </a>
          </Annotation>
        )}

        {(costSummary.hasCost || costSummary.hasTokens) && (
          <Annotation label="Running cost">
            <div className="space-y-1 font-mono text-[0.82rem] tabular-nums">
              {costSummary.hasCost && (
                <div className="text-[var(--boared-ink)]">
                  ${costSummary.cost.toFixed(4)}
                </div>
              )}
              {costSummary.hasTokens && (
                <div className="text-[var(--boared-ink-faint)] text-[0.72rem]">
                  {formatTokens(costSummary.totalTokens)} tokens
                </div>
              )}
            </div>
          </Annotation>
        )}
      </div>

      {/* Action strip — a torn-edge band at the bottom */}
      <div className="border-t border-[var(--boared-rule)]/60 bg-[var(--boared-paper-2)]/40 p-3 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start font-mono text-[0.62rem] uppercase tracking-[0.14em]"
          onClick={onOpenProperties}
        >
          Edit properties
        </Button>
        {primaryActions}
        {moreActions}
      </div>
    </div>
  );
}

/* ──────────────────── Bits ──────────────────── */

function Annotation({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Whisper({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-serif italic text-[0.88rem] text-[var(--boared-ink-faint)]">
      {children}
    </span>
  );
}

function DateLine({ label, value }: { label: string; value: string | Date | null | undefined }) {
  if (!value) return null;
  const ts = new Date(value as string | Date).toISOString();
  return (
    <div className="flex items-baseline justify-between gap-2 text-[0.82rem]">
      <span className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-[var(--boared-ink-faint)]">
        {label}
      </span>
      <span className="font-serif italic text-[var(--boared-ink)] tabular-nums">
        {relativeTime(ts)}
      </span>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* Re-exports so IssueDetail's action wiring keeps working. */
export { Workflow, Inbox, MoreHorizontal };
export function SidebarOverflow({ items }: { items: React.ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]"
        >
          <MoreHorizontal className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          More actions
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        <div className="flex flex-col">{items}</div>
      </PopoverContent>
    </Popover>
  );
}
