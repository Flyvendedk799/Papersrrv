/**
 * CaseQuickProps — horizontal, inline properties strip.
 *
 * Replaces the "everything behind a sidebar drawer" model with an
 * always-visible strip under the hero showing the handful of
 * properties most worth seeing at a glance. Each cell clicks
 * through to edit via the existing drawer (still available) so
 * this is read-first, not a full editor.
 *
 *   Status: ● In progress    Priority: ◆ High    Assignee: Claude
 *   Due: Apr 24 · 2d         Estimate: M         Project: Paperclip
 *
 * Design: all entries on one row with separating thin rules; wraps
 * on narrow viewports. Values read as mono-caps for status/priority
 * (brand consistency) and as serif italic for human identity fields.
 */

import type { Issue, IssuePriority, IssueStatus } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../../../api/agents";
import { projectsApi } from "../../../api/projects";
import { queryKeys } from "../../../lib/queryKeys";
import { cn, relativeTime } from "../../../lib/utils";
import { StatusIcon } from "../../StatusIcon";
import { PriorityIcon } from "../../PriorityIcon";

interface Props {
  issue: Issue;
  onOpenProperties?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function CaseQuickProps({ issue, onOpenProperties, className }: Props) {
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(issue.companyId),
    queryFn: () => agentsApi.list(issue.companyId),
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(issue.companyId),
    queryFn: () => projectsApi.list(issue.companyId),
  });

  const assigneeAgent = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const project = issue.projectId
    ? projects?.find((p) => p.id === issue.projectId)
    : null;
  const due = issue.dueDate ? new Date(issue.dueDate as string | Date) : null;
  const overdue = due ? due.getTime() < Date.now() : false;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 py-2 border-y border-[var(--boared-rule)] font-mono text-[0.58rem] uppercase tracking-[0.16em]",
        className,
      )}
    >
      <Cell
        label="Status"
        onClick={onOpenProperties}
        value={
          <span className="inline-flex items-center gap-1.5 text-[var(--boared-ink)]">
            <StatusIcon status={issue.status} />
            {STATUS_LABEL[issue.status]}
          </span>
        }
      />
      <Cell
        label="Priority"
        onClick={onOpenProperties}
        value={
          <span className="inline-flex items-center gap-1.5 text-[var(--boared-ink)]">
            <PriorityIcon priority={issue.priority} />
            {PRIORITY_LABEL[issue.priority]}
          </span>
        }
      />
      <Cell
        label="Assignee"
        onClick={onOpenProperties}
        value={
          assigneeAgent ? (
            <span className="font-serif italic text-[0.78rem] normal-case tracking-normal text-[var(--boared-ink)]">
              {assigneeAgent.name}
            </span>
          ) : issue.assigneeUserId ? (
            <span className="font-serif italic text-[0.78rem] normal-case tracking-normal text-[var(--boared-ink)]">
              {issue.assigneeUserId.slice(0, 12)}
            </span>
          ) : (
            <span className="text-[var(--boared-ink-faint)]">Unassigned</span>
          )
        }
      />
      {due && (
        <Cell
          label="Due"
          onClick={onOpenProperties}
          value={
            <span
              className={cn(
                "tabular-nums",
                overdue
                  ? "text-[var(--boared-acid)]"
                  : "text-[var(--boared-ink)]",
              )}
            >
              {due.toISOString().slice(0, 10)}
              {" · "}
              {relativeTime(due)}
              {overdue && " · overdue"}
            </span>
          }
        />
      )}
      {issue.estimate && (
        <Cell
          label="Estimate"
          onClick={onOpenProperties}
          value={<span className="text-[var(--boared-ink)]">{issue.estimate}</span>}
        />
      )}
      {project && (
        <Cell
          label="Project"
          value={
            <Link
              to={`/projects/${project.id}`}
              className="inline-flex items-center gap-1.5 no-underline text-inherit hover:text-[var(--boared-acid)]"
            >
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-sm"
                style={{ backgroundColor: project.color ?? "#6366f1" }}
              />
              <span className="font-serif italic text-[0.78rem] normal-case tracking-normal">
                {project.name}
              </span>
            </Link>
          }
        />
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="text-[var(--boared-ink-faint)]">{label}</span>
      <span aria-hidden="true" className="text-[var(--boared-ink-faint)]">·</span>
      <span>{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group/cell inline-flex items-center gap-1.5 hover:text-[var(--boared-ink)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
      >
        {inner}
      </button>
    );
  }
  return <span className="inline-flex items-center gap-1.5">{inner}</span>;
}
