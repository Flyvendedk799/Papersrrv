/**
 * CaseArtifacts — the "what was made" section of the CaseFile.
 *
 * Renders one tile per artifact (files, pull request, agent run
 * summary, sub-case, pending approval). Run-output tiles are
 * colored by the agent's seeded palette so you can track an agent
 * visually across graph → artifacts → sidebar.
 *
 * Run-output tiles are expandable: click to reveal the full summary
 * without leaving the page. Tiles also respond to the
 * `paperclip:case-graph-select` event — the matching tile pulses
 * acid-red when its author is selected in the graph.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GitPullRequest,
  Inbox,
  Layers,
  Sparkles,
} from "lucide-react";
import type { CaseSynthesisArtifact } from "../../../api/issues";
import { cn } from "../../../lib/utils";
import { agentColor } from "./agentColor";

interface Props {
  artifacts: CaseSynthesisArtifact[];
  loading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const ARTIFACTS_COMPACT_LIMIT = 6;

export function CaseArtifacts({ artifacts, loading, onRefresh, className }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visibleArtifacts = showAll
    ? artifacts
    : artifacts.slice(0, ARTIFACTS_COMPACT_LIMIT);
  const hiddenCount = artifacts.length - visibleArtifacts.length;

  // When a graph node is selected, spotlight the matching tile.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id) return;
      // Graph delegation ids look like `delegation:<agentId>`.
      // We key artifact-tile highlighting on the agent NAME (which
      // the synthesis embeds in the artifact's label prefix), so
      // find the delegation node's author. The simplest bridge: if
      // the id starts with "delegation:", mark focused by the id's
      // suffix for a short moment so the tile pulses even when we
      // don't have the name yet. Tiles listening below compare by
      // agentName derived from artifact.label.
      if (detail.id.startsWith("delegation:")) {
        setFocusedAgent(detail.id);
        window.setTimeout(() => setFocusedAgent(null), 1800);
      }
    };
    window.addEventListener("paperclip:case-graph-select", handler);
    return () => window.removeEventListener("paperclip:case-graph-select", handler);
  }, []);

  return (
    <div className={cn("relative", className)}>
      {onRefresh && !loading && (
        <button
          type="button"
          onClick={onRefresh}
          className="absolute -top-8 right-0 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
          title="Re-synthesise this case"
        >
          ↻ refresh
        </button>
      )}
      {loading && artifacts.length === 0 ? (
        <div className="flex flex-col gap-2">
          <div className="h-16 bg-[var(--boared-rule)]/25 animate-pulse" />
          <div className="h-16 bg-[var(--boared-rule)]/20 animate-pulse" />
        </div>
      ) : artifacts.length === 0 ? (
        <EmptyArtifacts />
      ) : (
        <div className="space-y-2.5">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleArtifacts.map((a, i) => {
              const key = `${a.kind}-${i}`;
              return (
                <ArtifactTile
                  key={key}
                  artifact={a}
                  expanded={expandedKey === key}
                  highlighted={
                    a.kind === "run-output" &&
                    !!focusedAgent &&
                    !!(a.meta?.agentId) &&
                    focusedAgent === `delegation:${a.meta.agentId}`
                  }
                  onToggle={() =>
                    setExpandedKey((cur) => (cur === key ? null : key))
                  }
                />
              );
            })}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full py-2 border border-dashed border-[var(--boared-rule)] font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:border-[var(--boared-ink-soft)] hover:bg-[var(--boared-paper-2)] transition-colors"
            >
              Show all {artifacts.length} · {hiddenCount} more
            </button>
          )}
          {showAll && artifacts.length > ARTIFACTS_COMPACT_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="w-full py-2 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── tile ─────────── */

function ArtifactTile({
  artifact,
  expanded,
  highlighted,
  onToggle,
}: {
  artifact: CaseSynthesisArtifact;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  const Icon = iconFor(artifact.kind);
  const tint = tintFor(artifact.kind);
  const hasLink = !!artifact.link;
  // For run-output tiles, seed a color from the agent name extracted
  // from the label prefix ("<Agent> — work summary").
  const agentName =
    artifact.kind === "run-output"
      ? artifact.label.split(" — ")[0].trim()
      : null;
  const agentTint = agentName ? agentColor(agentName).tint : null;
  const isExpandable = artifact.kind === "run-output" && (artifact.detail?.length ?? 0) > 140;

  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!highlighted) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlighted]);

  const inner = (
    <>
      {/* Top strip — colored by agent for run-output tiles; by kind
       * for everything else. Gives the scanner a visual handle. */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: agentTint ?? tint }}
      />
      <div className="flex items-start gap-3 pt-[7px]">
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center h-6 w-6 rounded-full shrink-0"
          style={{
            background: `color-mix(in oklab, ${agentTint ?? tint} 22%, transparent)`,
            color: agentTint ?? tint,
          }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-serif text-[0.98rem] leading-[1.2] text-[var(--boared-ink)] truncate">
              {artifact.label}
            </p>
            {hasLink && (
              <ExternalLink
                className="h-3 w-3 text-[var(--boared-ink-faint)] shrink-0"
                aria-hidden="true"
              />
            )}
          </div>
          {artifact.detail && (
            <p
              className={cn(
                "mt-1 text-[0.84rem] leading-snug text-[var(--boared-ink-soft)]",
                !expanded && "line-clamp-3",
              )}
            >
              {artifact.detail}
            </p>
          )}
          {isExpandable && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }}
              className="mt-1.5 inline-flex items-center gap-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Read full summary
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );

  const Wrapper: React.ElementType = hasLink ? "a" : "div";
  const wrapperProps = hasLink
    ? { href: artifact.link, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <li ref={ref} className="relative">
      <Wrapper
        {...wrapperProps}
        className={cn(
          "relative block p-3 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] h-full no-underline text-inherit transition-all",
          hasLink &&
            "hover:bg-[var(--boared-paper)] hover:border-[var(--boared-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/25",
          highlighted &&
            "!border-[var(--boared-acid)] shadow-[0_0_0_2px_var(--boared-acid)/30] bg-[var(--boared-paper)]",
        )}
      >
        {inner}
      </Wrapper>
    </li>
  );
}

/* ─────────── empty state ─────────── */

function EmptyArtifacts() {
  const hints: Array<[string, string]> = [
    ["📝", "Work summaries once an agent ships"],
    ["🔀", "Pull requests linked from run output"],
    ["📦", "Related cases spawned from this one"],
    ["⏳", "Approvals waiting on a human"],
  ];
  return (
    <div className="border border-dashed border-[var(--boared-rule)] p-4 space-y-2">
      <p className="font-serif italic text-[0.94rem] leading-snug text-[var(--boared-ink)]">
        Nothing has been produced on this case yet.
      </p>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
        {hints.map(([icon, text]) => (
          <li
            key={text}
            className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[var(--boared-ink-faint)]"
          >
            <span aria-hidden="true" className="text-[0.8rem]">
              {icon}
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function iconFor(kind: CaseSynthesisArtifact["kind"]) {
  switch (kind) {
    case "files":
      return FileText;
    case "pr":
      return GitPullRequest;
    case "run-output":
      return Sparkles;
    case "sub-issue":
      return Layers;
    case "approval":
      return Inbox;
  }
}

function tintFor(kind: CaseSynthesisArtifact["kind"]): string {
  switch (kind) {
    case "files":
      return "var(--boared-info)";
    case "pr":
      return "var(--boared-success)";
    case "run-output":
      return "var(--boared-feature)";
    case "sub-issue":
      return "var(--boared-review)";
    case "approval":
      return "var(--boared-warn)";
  }
}
