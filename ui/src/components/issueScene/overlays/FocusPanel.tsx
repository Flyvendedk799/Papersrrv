/* ─────────────────────────────────────────────────────────────────────
 *  FocusPanel — the "you are here" overlay for a focused node.
 *
 *  Mounts when the user has selected a node on the sphere. Gives them:
 *    · A clear breadcrumb (Case → Run / Comment / Parent / etc.)
 *    · Context-rich body (agent, timestamp, status, preview text)
 *    · Sibling nav (◂ Prev / Next ▸) to step through peers of the same
 *      kind without flying back to overview each time
 *    · Exit button (× back to overview) so the user always has an
 *      escape hatch from a zoomed-in view
 *
 *  Renders as a right-hand side DOM card (Boared tokens, monospace
 *  labels, plain-English body). Positioned to not overlap the
 *  ReadingKey (top-left) or QuestionPills (top-center).
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type {
  IssueGraph,
  SceneTarget,
} from "../data/types";

interface FocusPanelProps {
  graph: IssueGraph;
  selected: SceneTarget | null;
  onSelect: (t: SceneTarget) => void;
  onClose: () => void;
}

function formatRelative(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

/** Extract a FocusPanel-ready description + siblings list for the
 *  currently selected target. Returns null when the target has no
 *  friendly representation (shouldn't happen in practice). */
function buildFocusView(
  graph: IssueGraph,
  selected: SceneTarget,
): {
  breadcrumb: string;
  title: string;
  subtitle: string;
  body: string | null;
  meta: string[];
  siblings: SceneTarget[];
  selfIndex: number;
  color: string;
} | null {
  switch (selected.kind) {
    case "issue": {
      const i = selected.data;
      return {
        breadcrumb: "The matter",
        title: i.title ?? i.identifier ?? i.id.slice(0, 8),
        subtitle: i.identifier ?? i.id.slice(0, 8),
        body: null,
        meta: [
          (i.status ?? "").toString().replace(/_/g, " ").toUpperCase(),
          (i.priority ?? "").toString().toUpperCase(),
        ].filter(Boolean),
        siblings: [selected],
        selfIndex: 0,
        color: "var(--boared-ink, #1A1A18)",
      };
    }
    case "run": {
      const r = selected.data;
      const siblings: SceneTarget[] = graph.runs.map((x) => ({
        kind: "run",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "run" && s.data.runId === r.runId,
      );
      return {
        breadcrumb: "Run",
        title: r.agentName ?? "agent",
        subtitle: `Run · ${r.runId.slice(0, 8)}`,
        body: null,
        meta: [
          r.isLive ? "LIVE" : "DONE",
          formatRelative(r.startedAt),
        ].filter(Boolean),
        siblings,
        selfIndex,
        color: r.color,
      };
    }
    case "comment": {
      const c = selected.data;
      const siblings: SceneTarget[] = graph.comments.map((x) => ({
        kind: "comment",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "comment" && s.data.id === c.id,
      );
      return {
        breadcrumb: "Correspondence",
        title: c.authorName ?? "—",
        subtitle: "Comment",
        body: c.bodyPreview ?? null,
        meta: [formatRelative(c.createdAt)].filter(Boolean),
        siblings,
        selfIndex,
        color: c.color,
      };
    }
    case "event": {
      const e = selected.data;
      const siblings: SceneTarget[] = graph.events.map((x) => ({
        kind: "event",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "event" && s.data.id === e.id,
      );
      return {
        breadcrumb: "Activity",
        title: e.verb ?? "event",
        subtitle: e.actorName ?? "—",
        body: null,
        meta: [formatRelative(e.createdAt)].filter(Boolean),
        siblings,
        selfIndex,
        color: e.color,
      };
    }
    case "ancestor": {
      const a = selected.data;
      const siblings: SceneTarget[] = graph.ancestors.map((x) => ({
        kind: "ancestor",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "ancestor" && s.data.id === a.id,
      );
      return {
        breadcrumb: "Parent matter",
        title: a.title ?? a.identifier,
        subtitle: a.identifier,
        body: null,
        meta: [
          (a.status ?? "").toString().replace(/_/g, " ").toUpperCase(),
          `depth ${a.depth + 1}`,
        ].filter(Boolean),
        siblings,
        selfIndex,
        color: "var(--boared-ink, #1A1A18)",
      };
    }
    case "descendant": {
      const d = selected.data;
      const siblings: SceneTarget[] = graph.descendants.map((x) => ({
        kind: "descendant",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "descendant" && s.data.id === d.id,
      );
      return {
        breadcrumb: d.kind === "mention" ? "Mentioned matter" : "Sub-matter",
        title: d.title ?? d.identifier,
        subtitle: d.identifier,
        body: null,
        meta: [
          (d.status ?? "").toString().replace(/_/g, " ").toUpperCase(),
        ].filter(Boolean),
        siblings,
        selfIndex,
        color: "var(--boared-ink, #1A1A18)",
      };
    }
    case "approval": {
      const a = selected.data;
      const siblings: SceneTarget[] = graph.approvals.map((x) => ({
        kind: "approval",
        data: x,
      }));
      const selfIndex = siblings.findIndex(
        (s) => s.kind === "approval" && s.data.id === a.id,
      );
      return {
        breadcrumb: "Approval",
        title: a.status.toUpperCase(),
        subtitle: `Approval · ${a.id.slice(0, 8)}`,
        body: null,
        meta: [
          a.decidedAt ? `Decided ${formatRelative(a.decidedAt)}` : `Requested ${formatRelative(a.requestedAt)}`,
        ].filter(Boolean),
        siblings,
        selfIndex,
        color:
          a.status === "pending"
            ? "#B45309"
            : a.status === "approved"
              ? "#176B3A"
              : a.status === "rejected"
                ? "#B22B1A"
                : "var(--boared-ink, #1A1A18)",
      };
    }
  }
}

export function FocusPanel({
  graph,
  selected,
  onSelect,
  onClose,
}: FocusPanelProps) {
  const view = useMemo(
    () => (selected ? buildFocusView(graph, selected) : null),
    [graph, selected],
  );

  if (!selected || !view) return null;

  const hasSiblings = view.siblings.length > 1;
  const canPrev = hasSiblings && view.selfIndex > 0;
  const canNext = hasSiblings && view.selfIndex < view.siblings.length - 1;

  const goPrev = () => {
    if (canPrev) onSelect(view.siblings[view.selfIndex - 1]);
  };
  const goNext = () => {
    if (canNext) onSelect(view.siblings[view.selfIndex + 1]);
  };

  return (
    <div
      data-focus-panel
      className="absolute right-5 z-20 pointer-events-auto"
      style={{
        top: 60,
        width: 280,
      }}
    >
      <div
        className="rounded-md border px-3 py-2.5 flex flex-col gap-2"
        style={{
          background:
            "color-mix(in oklch, var(--boared-paper, #F2F0EA) 94%, transparent)",
          borderColor: "var(--boared-rule, #D8D6CF)",
          color: "var(--boared-ink, #1A1A18)",
          boxShadow:
            "0 8px 28px color-mix(in oklch, var(--boared-ink, #1A1A18) 18%, transparent)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        {/* Header: breadcrumb + × close */}
        <div className="flex items-center justify-between gap-2">
          <div
            className="font-mono uppercase flex items-center gap-1.5 min-w-0"
            style={{
              fontSize: "0.54rem",
              letterSpacing: "0.22em",
              color: "var(--boared-ink-soft, #3F3F3A)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: view.color,
                boxShadow: `0 0 6px ${view.color}`,
                flexShrink: 0,
              }}
            />
            <span style={{ opacity: 0.7 }}>Focused</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span className="truncate">{view.breadcrumb}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to overview"
            className="inline-flex items-center justify-center rounded-sm"
            style={{
              width: 18,
              height: 18,
              fontSize: "0.7rem",
              color: "var(--boared-ink-soft, #3F3F3A)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="Back to overview (Esc)"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.3,
            fontWeight: 600,
            color: "var(--boared-ink, #1A1A18)",
            wordBreak: "break-word",
          }}
        >
          {view.title}
        </div>

        {/* Subtitle */}
        {view.subtitle && (
          <div
            className="font-mono"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              color: "var(--boared-ink-faint, #82827A)",
            }}
          >
            {view.subtitle}
          </div>
        )}

        {/* Body preview (comments) */}
        {view.body && (
          <div
            style={{
              fontSize: "0.8rem",
              lineHeight: 1.4,
              color: "var(--boared-ink-soft, #3F3F3A)",
              borderLeft: "2px solid var(--boared-rule, #D8D6CF)",
              paddingLeft: 8,
            }}
          >
            {view.body}
          </div>
        )}

        {/* Meta chips */}
        {view.meta.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {view.meta.map((m, i) => (
              <span
                key={i}
                className="font-mono uppercase"
                style={{
                  fontSize: "0.52rem",
                  letterSpacing: "0.18em",
                  color: "var(--boared-ink-soft, #3F3F3A)",
                  borderColor: "var(--boared-rule, #D8D6CF)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  padding: "2px 6px",
                  borderRadius: 2,
                }}
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {/* Sibling nav */}
        {hasSiblings && (
          <div
            className="flex items-center justify-between mt-1 pt-2"
            style={{
              borderTop: "1px solid var(--boared-rule, #D8D6CF)",
            }}
          >
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              className="inline-flex items-center gap-1 font-mono uppercase rounded-sm"
              style={{
                fontSize: "0.56rem",
                letterSpacing: "0.16em",
                padding: "3px 6px",
                color: canPrev
                  ? "var(--boared-ink, #1A1A18)"
                  : "var(--boared-ink-faint, #82827A)",
                opacity: canPrev ? 1 : 0.4,
                cursor: canPrev ? "pointer" : "not-allowed",
                background: "transparent",
              }}
              title="Previous"
            >
              <span aria-hidden="true">◂</span>
              <span>Prev</span>
            </button>
            <span
              className="font-mono"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.12em",
                color: "var(--boared-ink-faint, #82827A)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {view.selfIndex + 1} / {view.siblings.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="inline-flex items-center gap-1 font-mono uppercase rounded-sm"
              style={{
                fontSize: "0.56rem",
                letterSpacing: "0.16em",
                padding: "3px 6px",
                color: canNext
                  ? "var(--boared-ink, #1A1A18)"
                  : "var(--boared-ink-faint, #82827A)",
                opacity: canNext ? 1 : 0.4,
                cursor: canNext ? "pointer" : "not-allowed",
                background: "transparent",
              }}
              title="Next"
            >
              <span>Next</span>
              <span aria-hidden="true">▸</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
