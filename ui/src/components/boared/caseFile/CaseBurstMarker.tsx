/**
 * CaseBurstMarker — a compact inline divider representing a cluster
 * of hidden heartbeat / status reports between two real messages.
 *
 *     ─────  ⊹  PCM · 58 reports · over 3h  ⊹  ─────
 *
 * Click expands the burst inline into a stack of the individual
 * heartbeat posts rendered at a much smaller size (one-line author
 * + time + first line). Collapse returns to the marker.
 */

import { useState } from "react";
import type { IssueComment, Agent } from "@paperclipai/shared";
import { cn, relativeTime } from "../../../lib/utils";
import { agentColor } from "./agentColor";
import { formatBurstSpan, type HeartbeatBurst } from "./threadFilter";

interface Props {
  burst: HeartbeatBurst;
  /** The raw heartbeat comments — used when the burst is expanded. */
  comments: IssueComment[];
  agentMap?: Map<string, Agent>;
  className?: string;
}

export function CaseBurstMarker({ burst, comments, agentMap, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  const agentNames = burst.authorIds.map(
    (id) => agentMap?.get(id)?.name ?? id.slice(0, 6),
  );
  const primaryAgent = agentNames[0] ?? "Agents";
  const extraAgents = agentNames.length > 1 ? ` +${agentNames.length - 1}` : "";
  const tint = agentColor(primaryAgent).tint;

  return (
    <div className={cn("my-1", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "group w-full flex items-center gap-3 py-1 text-left transition-colors",
          "hover:text-[var(--boared-ink)]",
          expanded ? "text-[var(--boared-ink)]" : "text-[var(--boared-ink-faint)]",
        )}
        aria-expanded={expanded}
      >
        <span
          aria-hidden="true"
          className="flex-1 h-px"
          style={{ background: "var(--boared-rule)" }}
        />
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: tint, opacity: 0.7 }}
        />
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] shrink-0 tabular-nums">
          {primaryAgent}
          {extraAgents} · {burst.count} {burst.count === 1 ? "status report" : "status reports"} · {formatBurstSpan(burst)}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "inline-block font-mono text-[0.6rem] tracking-[0.14em] shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        >
          ▾
        </span>
        <span
          aria-hidden="true"
          className="flex-1 h-px"
          style={{ background: "var(--boared-rule)" }}
        />
      </button>

      {expanded && (
        <ol className="mt-2 mb-3 border-l border-[var(--boared-rule)] pl-3 space-y-1.5">
          {comments.map((c) => {
            const authorName = c.authorAgentId
              ? agentMap?.get(c.authorAgentId)?.name ?? c.authorAgentId.slice(0, 6)
              : c.authorUserId ?? "—";
            const color = agentColor(authorName).tint;
            // First non-empty line of the body, trimmed to a preview.
            const firstLine = (c.body ?? "")
              .split(/\n/)
              .find((l) => l.trim().length > 0)
              ?.replace(/^#+\s+/, "")
              .trim();
            const preview = firstLine
              ? firstLine.length > 140
                ? firstLine.slice(0, 139) + "…"
                : firstLine
              : "(empty)";
            return (
              <li
                key={c.id}
                id={`comment-${c.id}`}
                className="flex items-start gap-2 text-[0.76rem] leading-snug"
              >
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: color, opacity: 0.8 }}
                />
                <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] tabular-nums shrink-0 w-[64px]">
                  {relativeTime(new Date(c.createdAt).toISOString())}
                </span>
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--boared-ink)] shrink-0 w-[80px] truncate">
                  {authorName}
                </span>
                <span className="font-serif italic text-[var(--boared-ink-soft)] min-w-0 flex-1 truncate">
                  {preview}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
