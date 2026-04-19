/**
 * CaseRecentActivity — "what just happened" feed in the sidebar.
 *
 * A tiny timeline of the most recent events on the case (up to 5).
 * Each entry: a dot + event kind + author + relative time. Lets the
 * reader see the pulse of the case without scrolling to the thread.
 *
 * Events are derived from the synthesis graph (so we don't fetch
 * anything new). Delegations + sub-issues + approvals + opener
 * comment are all merged and sorted by ts descending.
 */

import { useCallback } from "react";
import { cn, relativeTime } from "../../../lib/utils";
import type { CaseSynthesisPayload } from "../../../api/issues";
import { agentColor } from "./agentColor";

interface Props {
  synthesis: CaseSynthesisPayload | null;
  limit?: number;
  className?: string;
}

interface FeedEvent {
  id: string;
  kind: "delegation" | "sub-issue" | "approval" | "comment";
  label: string;
  author: string | null;
  ts: number;
  tint: string;
}

export function CaseRecentActivity({ synthesis, limit = 5, className }: Props) {
  const events = extractFeed(synthesis, limit);

  const onJump = useCallback((id: string) => {
    window.dispatchEvent(
      new CustomEvent("paperclip:case-graph-select", { detail: { id } }),
    );
    document
      .getElementById("chapter-graph")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (events.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        Recent activity
      </div>
      <ol className="relative space-y-2 pl-3.5">
        <span
          aria-hidden="true"
          className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-[var(--boared-rule)]"
        />
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[13px] top-1 h-2 w-2 rounded-full"
              style={{ background: e.tint, border: "1px solid var(--boared-paper)", boxShadow: "0 0 0 1px var(--boared-rule)" }}
            />
            <button
              type="button"
              onClick={() => onJump(e.id)}
              className="text-left w-full group"
            >
              <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] tabular-nums">
                {relativeTime(new Date(e.ts).toISOString())}
              </div>
              <div className="font-serif italic text-[0.84rem] leading-[1.22] text-[var(--boared-ink)] group-hover:text-[var(--boared-acid)] transition-colors">
                {e.label}
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function extractFeed(
  synthesis: CaseSynthesisPayload | null,
  limit: number,
): FeedEvent[] {
  if (!synthesis) return [];
  const out: FeedEvent[] = [];
  for (const n of synthesis.graph.nodes) {
    if (n.kind === "issue") continue; // root isn't a feed event
    if (!n.ts) continue;
    let label = n.label;
    let tint = "var(--boared-ink-soft)";
    if (n.kind === "delegation") {
      label = `${n.authorName ?? "Agent"} ${n.sublabel?.includes("working") ? "working on it" : "delegated"}`;
      tint = agentColor(n.authorName ?? n.id).tint;
    } else if (n.kind === "sub-issue") {
      label = `Related case · ${n.label}`;
      tint = "var(--boared-review)";
    } else if (n.kind === "approval") {
      label = n.status === "pending" ? "Approval requested" : `Approval ${n.status}`;
      tint = n.status === "pending" ? "var(--boared-acid)" : "var(--boared-mute)";
    } else if (n.kind === "comment") {
      label = `${n.authorName ?? "Someone"} opened the case`;
      tint = "var(--boared-info)";
    }
    out.push({
      id: n.id,
      kind: n.kind as FeedEvent["kind"],
      label,
      author: n.authorName ?? null,
      ts: n.ts,
      tint,
    });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}
