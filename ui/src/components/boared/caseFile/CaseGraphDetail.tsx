/**
 * CaseGraphDetail — the slide-in panel that appears on the right of
 * the graph viewport when a node is selected.
 *
 * Richer than the hover card: shows the agent's work summary from
 * the matching artifact, per-attempt breakdown (for delegations),
 * links back into the thread and artifacts below. Backed by the
 * same `CaseSynthesisPayload` the graph itself uses, so no extra
 * fetch.
 *
 * Slides in from the right edge on mount, out on unmount via CSS
 * transition — no js animation required.
 */

import { X } from "lucide-react";
import type {
  CaseSynthesisArtifact,
  CaseSynthesisGraphNode,
  CaseSynthesisPayload,
} from "../../../api/issues";
import { cn, relativeTime } from "../../../lib/utils";
import { agentColor } from "./agentColor";

interface Props {
  node: CaseSynthesisGraphNode | null;
  synthesis: CaseSynthesisPayload | null;
  onClose: () => void;
  onJumpToThread?: () => void;
}

export function CaseGraphDetail({ node, synthesis, onClose, onJumpToThread }: Props) {
  if (!node) return null;
  const color = agentColor(node.authorName ?? node.id);
  const artifact = node.kind === "delegation"
    ? findAgentArtifact(synthesis, node.authorName ?? "")
    : null;

  return (
    <div
      role="dialog"
      aria-label="Node details"
      className={cn(
        "absolute top-2 right-2 bottom-2 z-10 w-[280px] max-w-[min(360px,calc(100%-16px))]",
        "border border-[var(--boared-rule)] bg-[var(--boared-paper)]",
        "flex flex-col overflow-hidden shadow-lg",
        "animate-[cg-slide-in_220ms_cubic-bezier(0.22,0.61,0.36,1)_backwards]",
      )}
      style={{
        // @ts-ignore — custom keyframe registered in CaseGraph's <style>.
      }}
    >
      <style>{`
        @keyframes cg-slide-in {
          from { transform: translateX(16px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Top strip — color-tinted by agent seed */}
      <div
        className="h-1 shrink-0"
        style={{ background: color.tint }}
        aria-hidden="true"
      />

      {/* Header */}
      <header className="flex items-start gap-2 px-3 pt-3 pb-2 border-b border-[var(--boared-rule)]">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            {prettyKind(node.kind)}
            {node.ts && ` · ${relativeTime(new Date(node.ts).toISOString())}`}
          </div>
          <div
            className="mt-0.5 font-serif italic text-[0.98rem] leading-[1.2] text-[var(--boared-ink)]"
            title={node.label}
          >
            {node.label}
          </div>
          {node.sublabel && (
            <div className="mt-1 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
              {node.sublabel}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 inline-flex items-center justify-center h-6 w-6 text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {artifact ? (
          <Section label="Work summary">
            <p className="text-[0.84rem] leading-[1.45] text-[var(--boared-ink)]">
              {artifact.detail ?? "No detail available."}
            </p>
          </Section>
        ) : node.kind === "comment" && node.sublabel ? (
          <Section label="The note">
            <p className="font-serif italic text-[0.88rem] leading-[1.4] text-[var(--boared-ink)]">
              &ldquo;{node.sublabel}&rdquo;
            </p>
          </Section>
        ) : node.kind === "sub-issue" ? (
          <Section label="Relation">
            <p className="text-[0.82rem] leading-[1.4] text-[var(--boared-ink-soft)]">
              A separate case spawned from this one. Check it for its
              own thread, artifacts, and state.
            </p>
          </Section>
        ) : node.kind === "approval" ? (
          <Section label="Decision">
            <p className="text-[0.82rem] leading-[1.4] text-[var(--boared-ink-soft)]">
              {node.status === "pending"
                ? "A human needs to say yes or no before the case can move forward."
                : node.status === "approved"
                  ? "This decision was approved."
                  : "This decision was rejected."}
            </p>
          </Section>
        ) : null}

        {node.kind === "delegation" && (
          <Section label="Attempts">
            <DelegationAttempts sublabel={node.sublabel} status={node.status} />
          </Section>
        )}
      </div>

      {/* Footer actions */}
      {(onJumpToThread || node.kind === "sub-issue") && (
        <footer className="shrink-0 border-t border-[var(--boared-rule)] px-3 py-2 flex items-center gap-2">
          {onJumpToThread && (
            <button
              type="button"
              onClick={onJumpToThread}
              className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink)] hover:text-[var(--boared-acid)] transition-colors"
            >
              → Jump to thread
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

/* ────────── bits ────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        {label}
      </h4>
      {children}
    </section>
  );
}

function DelegationAttempts({
  sublabel,
  status,
}: {
  sublabel: string | undefined;
  status: string | undefined;
}) {
  const match = sublabel?.match(/^(\d+)\s+attempt[s]?\s*·\s*(.+)$/);
  const count = match ? parseInt(match[1], 10) : 0;
  const outcome = match ? match[2] : sublabel ?? "";
  const live = status === "live";
  const pipColor =
    live ? "var(--boared-acid)"
      : outcome.includes("resolved") ? "var(--boared-success)"
        : outcome.includes("stuck") ? "var(--boared-warn)"
          : "var(--boared-ink-soft)";
  const show = Math.min(count, 36);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: show }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: pipColor, opacity: 0.85 }}
          />
        ))}
        {count > show && (
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            +{count - show}
          </span>
        )}
      </div>
      <div className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
        {count} {count === 1 ? "attempt" : "attempts"} ·{" "}
        <span style={{ color: pipColor }}>{live ? "working on it" : outcome}</span>
      </div>
    </div>
  );
}

function findAgentArtifact(
  synthesis: CaseSynthesisPayload | null,
  agentName: string,
): CaseSynthesisArtifact | null {
  if (!synthesis) return null;
  return (
    synthesis.artifacts.find(
      (a) => a.kind === "run-output" && a.label.startsWith(`${agentName} —`),
    ) ?? null
  );
}

function prettyKind(kind: CaseSynthesisGraphNode["kind"]): string {
  switch (kind) {
    case "issue":
      return "Case";
    case "delegation":
      return "Delegation";
    case "run":
      return "Attempt";
    case "comment":
      return "Comment";
    case "approval":
      return "Approval";
    case "sub-issue":
      return "Related case";
    case "ancestor":
      return "Parent case";
    case "resolution":
      return "Resolution";
  }
}
