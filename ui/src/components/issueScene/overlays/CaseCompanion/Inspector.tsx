/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion / Inspector — detail mode.
 *
 *  Shown when a SceneTarget is selected (clicked in 3D, or clicked in
 *  a below-fold row). Absorbs the responsibilities of the former
 *  floating SelectedPanel: per-kind detail card, agent/status color
 *  dot, "Open matter" for navigable kinds, timestamps + metadata for
 *  runs/comments/events/approvals.
 *
 *  Adds on top of SelectedPanel's old content:
 *    · "View in <section> ↓" link that scrolls to and pulses the
 *      matching below-fold row
 *    · "Back to overview" close button
 *
 *  Reads target from context; navigation is dispatched via react-router.
 * ───────────────────────────────────────────────────────────────────── */

import { useNavigate } from "react-router-dom";
import type { SceneTarget } from "../../data/types";
import type { IssueComment } from "@paperclipai/shared";
import { relativeTime } from "../../../../lib/utils";
import { colorForNode } from "../../colors";
import { CompanionHeader } from "./header";
import {
  useSceneActions,
  useSceneState,
  resolveSelectionRef,
} from "../../state/SceneStateContext";
import {
  causalContextFor,
  type ProvenanceRef,
} from "../../data/causalContext";
import { useEffect, useMemo, useState } from "react";

interface InspectorProps {
  target: SceneTarget;
  onClose: () => void;
}

export function Inspector({ target, onClose }: InspectorProps) {
  useInspectorKeyboardNav(target);
  return (
    <div>
      <CompanionHeader
        title="Inspector"
        subtitle={subtitleFor(target)}
        onClose={onClose}
        closeLabel="Back to overview"
      />
      <JourneyBreadcrumbs />
      <div className="space-y-3">
        <InspectorBody target={target} onClose={onClose} />
        <CausalSummary target={target} />
        <ContinueSuggestion target={target} />
      </div>
    </div>
  );
}

/* ─── Keyboard navigation ───────────────────────────────────────
 *
 *   →  / Space  : advance to nextSuggestion
 *   ←  / Backspace : go back one journey step
 *   j  / ↓      : cycle to next peer (siblings → effects)
 *   k  / ↑      : cycle to previous peer
 *
 * Registered only while the Inspector is open. Honours text-input
 * focus so typing in the composer below the fold doesn't hijack
 * keys.
 */
function useInspectorKeyboardNav(target: SceneTarget) {
  const state = useSceneState();
  const actions = useSceneActions();
  const ctx = useMemo(
    () => causalContextFor(target, state.graph),
    [target, state.graph],
  );

  /* Flatten siblings + effects into one cycle ring so J/K march
   * through every peer regardless of which bucket they're in. */
  const cycle = useMemo(
    () => [...ctx.siblings, ...ctx.effects],
    [ctx.siblings, ctx.effects],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = e.target as HTMLElement | null;
      if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
      if (active && active.isContentEditable) return;

      switch (e.key) {
        case "ArrowRight":
        case " ": // Space
          if (ctx.nextSuggestion) {
            e.preventDefault();
            actions.selectAndFocus(ctx.nextSuggestion.target);
          }
          return;
        case "ArrowLeft":
        case "Backspace":
          if (state.journey.length > 0) {
            e.preventDefault();
            actions.goBack();
          }
          return;
        case "j":
        case "J":
        case "ArrowDown": {
          if (cycle.length === 0) return;
          e.preventDefault();
          // Find current position; if target matches one of the peers,
          // step forward; otherwise land on index 0.
          const idx = cycle.findIndex(
            (p) =>
              p.target.kind === target.kind &&
              refIdOf(p.target) === refIdOf(target),
          );
          const next = cycle[(idx + 1) % cycle.length];
          actions.selectAndFocus(next.target);
          return;
        }
        case "k":
        case "K":
        case "ArrowUp": {
          if (cycle.length === 0) return;
          e.preventDefault();
          const idx = cycle.findIndex(
            (p) =>
              p.target.kind === target.kind &&
              refIdOf(p.target) === refIdOf(target),
          );
          const prev =
            cycle[(idx - 1 + cycle.length) % cycle.length];
          actions.selectAndFocus(prev.target);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, ctx, cycle, state.journey.length, target]);
}

function refIdOf(t: SceneTarget): string {
  switch (t.kind) {
    case "issue":
      return t.data.id;
    case "ancestor":
    case "descendant":
    case "comment":
    case "event":
    case "approval":
      return t.data.id;
    case "run":
      return t.data.runId;
  }
}

/* Keyboard shortcuts (→ / ← / J / K / Esc) still bind via
 * `useInspectorKeyboardNav`. The visible keycap cheat-sheet was
 * removed to keep the Inspector panel quiet — power users who press
 * the keys simply discover that they work. */

/* ─── Journey breadcrumbs ────────────────────────────────────────
 *
 * A horizontal trail of "where you came from" dots. Shows up above
 * the Inspector body when the user has navigated through at least
 * one causal click. Each crumb is clickable: jumping to an older
 * crumb truncates the trail past that point (it's becoming the new
 * current selection).
 *
 * The VERY FIRST crumb the user started from is the anchor — if
 * they want to escape the trail entirely, the Companion header's
 * "Back to overview" clears everything.
 */
function JourneyBreadcrumbs() {
  const state = useSceneState();
  const actions = useSceneActions();
  /* Only appear after the user has actually traversed — a single
   * step doesn't earn a crumb bar. */
  if (state.journey.length < 2) return null;

  return (
    <div
      className="mb-3 pb-2 flex items-center flex-wrap gap-x-1.5 gap-y-1 font-mono uppercase"
      style={{
        fontSize: "0.52rem",
        letterSpacing: "0.22em",
        color: "var(--boared-ink-faint, currentColor)",
        borderBottom: "1px dotted var(--boared-rule, currentColor)",
      }}
    >
      <span style={{ opacity: 0.65 }}>Journey ·</span>
      <button
        type="button"
        onClick={actions.goBack}
        title="Go back one step"
        className="font-mono uppercase transition-colors"
        style={{
          fontSize: "0.52rem",
          letterSpacing: "0.22em",
          color: "var(--boared-acid, currentColor)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0 4px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
      >
        ← Back
      </button>
      {state.journey.map((ref, i) => {
        const target = resolveSelectionRef(state.graph, ref);
        const label = target
          ? shortLabelForTarget(target)
          : `${ref.kind} · ${ref.id.slice(0, 8)}`;
        return (
          <span key={`${ref.kind}:${ref.id}:${i}`} className="flex items-center gap-1.5">
            <span aria-hidden style={{ opacity: 0.4 }}>/</span>
            <button
              type="button"
              onClick={() => actions.jumpToJourneyIndex(i)}
              title={`Jump back to ${label}`}
              className="font-mono uppercase transition-colors"
              style={{
                fontSize: "0.52rem",
                letterSpacing: "0.22em",
                color: "var(--boared-ink-soft, inherit)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--boared-acid, currentColor)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--boared-ink-soft, inherit)";
              }}
            >
              {label}
            </button>
          </span>
        );
      })}
      <span style={{ opacity: 0.4 }}>/</span>
      <span style={{ color: "var(--boared-ink, currentColor)" }}>here</span>
    </div>
  );
}

function shortLabelForTarget(t: SceneTarget): string {
  switch (t.kind) {
    case "issue":
      return "The matter";
    case "ancestor":
      return `Parent § ${t.data.identifier}`;
    case "descendant":
      return `§ ${t.data.identifier}`;
    case "run":
      return `Run · ${t.data.agentName}`;
    case "comment":
      return `Cmt · ${t.data.authorName}`;
    case "event":
      return `Evt · ${t.data.actorName}`;
    case "approval":
      return `Approval · ${t.data.status}`;
  }
}

/* ─── Causal summary ─────────────────────────────────────────────
 *
 * ONE compact row replaces three labeled panels. For most nodes the
 * causal context is small (1 source, maybe 2 siblings, maybe 2 effects)
 * and doesn't need dedicated sections. The summary shows chips with
 * counts; clicking a chip expands the full list inline.
 *
 * Nothing renders when there's no causal context at all.
 */
function CausalSummary({ target }: { target: SceneTarget }) {
  const state = useSceneState();
  const actions = useSceneActions();
  const ctx = useMemo(
    () => causalContextFor(target, state.graph),
    [target, state.graph],
  );
  const [expanded, setExpanded] = useState<
    "sources" | "siblings" | "effects" | null
  >(null);

  if (
    ctx.sources.length === 0 &&
    ctx.siblings.length === 0 &&
    ctx.effects.length === 0
  )
    return null;

  const chip = (
    key: "sources" | "siblings" | "effects",
    label: string,
    count: number,
  ) => {
    if (count === 0) return null;
    const on = expanded === key;
    return (
      <button
        type="button"
        onClick={() => setExpanded(on ? null : key)}
        className="font-mono uppercase transition-colors"
        style={{
          fontSize: "0.52rem",
          letterSpacing: "0.22em",
          padding: "3px 7px",
          border: `1px solid ${on ? "var(--boared-acid, currentColor)" : "var(--boared-rule, currentColor)"}`,
          background: on
            ? "var(--boared-paper-2, transparent)"
            : "transparent",
          color: on
            ? "var(--boared-acid, currentColor)"
            : "var(--boared-ink-soft, inherit)",
          cursor: "pointer",
        }}
      >
        {label} · {count}
      </button>
    );
  };

  const expandedList =
    expanded === "sources"
      ? ctx.sources
      : expanded === "siblings"
        ? ctx.siblings
        : expanded === "effects"
          ? ctx.effects
          : null;

  return (
    <div
      className="mt-3 pt-3"
      style={{
        borderTop: "1px solid var(--boared-rule, currentColor)",
      }}
    >
      <div className="flex items-center flex-wrap gap-1.5">
        {chip("sources", "Came from", ctx.sources.length)}
        {chip("siblings", "Also from", ctx.siblings.length)}
        {chip("effects", "Led to", ctx.effects.length)}
      </div>
      {expandedList && (
        <div className="mt-2">
          <ProvenanceList
            items={expandedList}
            onSelect={actions.selectAndFocus}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Continue suggestion ───────────────────────────────────────
 *
 * The next single step the user is likely to want — prominent so
 * they can keep walking the trail without thinking. Picks from
 * effects > siblings > sources (forward motion preferred).
 */
function ContinueSuggestion({ target }: { target: SceneTarget }) {
  const state = useSceneState();
  const actions = useSceneActions();
  const ctx = useMemo(
    () => causalContextFor(target, state.graph),
    [target, state.graph],
  );
  if (!ctx.nextSuggestion) return null;
  const next = ctx.nextSuggestion;
  return (
    <div
      className="mt-1 pt-3"
      style={{ borderTop: "1px solid var(--boared-rule, currentColor)" }}
    >
      <div
        className="font-mono uppercase mb-2"
        style={{
          fontSize: "0.52rem",
          letterSpacing: "0.32em",
          color: "var(--boared-ink-faint, currentColor)",
        }}
      >
        Continue the trail
      </div>
      <button
        type="button"
        onClick={() => actions.selectAndFocus(next.target)}
        className="w-full text-left font-display italic flex items-center gap-3 transition-all"
        style={{
          fontSize: "1.08rem",
          padding: "14px 16px",
          border: "1px solid var(--boared-acid, currentColor)",
          background: "var(--boared-acid, #B22B1A)",
          color: "var(--boared-paper, #F2F0EA)",
          cursor: "pointer",
          boxShadow:
            "0 0 24px color-mix(in oklab, var(--boared-acid) 25%, transparent), inset 0 0 0 0 var(--boared-acid)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow =
            "0 0 36px color-mix(in oklab, var(--boared-acid) 40%, transparent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow =
            "0 0 24px color-mix(in oklab, var(--boared-acid) 25%, transparent)";
        }}
      >
        <span aria-hidden style={{ opacity: 0.8 }}>
          →
        </span>
        <span className="flex-1 min-w-0">
          <span className="block">{next.label}</span>
          {next.secondary && (
            <span
              className="block truncate font-mono not-italic"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.78)",
                marginTop: 2,
              }}
            >
              {next.secondary}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono"
          style={{
            fontSize: "0.56rem",
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          →
        </span>
      </button>
    </div>
  );
}

function ProvenanceList({
  items,
  onSelect,
}: {
  items: ProvenanceRef[];
  onSelect: (t: SceneTarget) => void;
}) {
  return (
    <section>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={() => onSelect(it.target)}
              className="w-full text-left flex items-start gap-2 transition-colors"
              style={{
                padding: "6px 8px",
                background: "transparent",
                border: "1px solid var(--boared-rule, currentColor)",
                color: "var(--boared-ink, inherit)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "var(--boared-paper-2, transparent)";
                e.currentTarget.style.borderColor =
                  "var(--boared-acid, currentColor)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor =
                  "var(--boared-rule, currentColor)";
              }}
            >
              <span
                aria-hidden
                className="mt-[5px] shrink-0"
                style={{ width: 7, height: 7, background: it.accent }}
              />
              <span className="flex-1 min-w-0">
                <span
                  className="block truncate text-sm"
                  style={{ color: "var(--boared-ink, inherit)" }}
                >
                  {it.label}
                </span>
                {it.secondary && (
                  <span
                    className="block truncate font-mono"
                    style={{
                      fontSize: "0.56rem",
                      letterSpacing: "0.08em",
                      color: "var(--boared-ink-faint, inherit)",
                      marginTop: 1,
                    }}
                  >
                    {it.secondary}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className="shrink-0 font-mono"
                style={{
                  fontSize: "0.56rem",
                  letterSpacing: "0.18em",
                  color: "var(--boared-ink-faint, currentColor)",
                  marginTop: 4,
                }}
              >
                ↗
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function subtitleFor(t: SceneTarget): string {
  switch (t.kind) {
    case "issue":
      return "The matter";
    case "ancestor":
      return "Parent matter";
    case "descendant":
      return t.data.kind === "direct" ? "Sub-matter" : "Mentioned matter";
    case "run":
      return `Run · ${t.data.agentName}`;
    case "comment":
      return `Correspondence · ${t.data.authorName}`;
    case "event":
      return `Activity · ${t.data.actorName}`;
    case "approval":
      return "Approval";
  }
}

function InspectorBody({
  target,
  onClose,
}: {
  target: SceneTarget;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const actions = useSceneActions();
  const dot = colorForNode(target);

  switch (target.kind) {
    case "issue":
      return (
        <div>
          <Row color={dot} label={target.data.title} />
          {target.data.description && (
            <Body>{target.data.description}</Body>
          )}
          <MetaRow
            label="Status"
            value={`${target.data.status
              .toUpperCase()
              .replace(/_/g, " ")} · ${target.data.priority.toUpperCase()}`}
          />
        </div>
      );

    case "ancestor":
      return (
        <div>
          <Row
            color={dot}
            label={target.data.title}
            mono={`§ ${target.data.identifier}`}
          />
          <MetaRow
            label="Status"
            value={target.data.status.toUpperCase().replace(/_/g, " ")}
          />
          <ActionStack>
            <JumpButton
              label="View in Lineage ↓"
              onClick={() => {
                jumpTo("chapter-lineage", `ancestor-${target.data.id}`);
              }}
            />
            <OpenMatterButton
              onClick={() => {
                actions.select(null);
                navigate(`/issues/${target.data.identifier}`);
              }}
            />
          </ActionStack>
        </div>
      );

    case "descendant":
      return (
        <div>
          <Row
            color={dot}
            label={target.data.title}
            mono={`§ ${target.data.identifier}`}
          />
          <MetaRow
            label="Status"
            value={target.data.status.toUpperCase().replace(/_/g, " ")}
          />
          <ActionStack>
            <JumpButton
              label="View in Sub-matters ↓"
              onClick={() => {
                jumpTo("chapter-subtasks", `submatter-${target.data.id}`);
              }}
            />
            <OpenMatterButton
              onClick={() => {
                actions.select(null);
                navigate(`/issues/${target.data.identifier}`);
              }}
            />
          </ActionStack>
        </div>
      );

    case "run": {
      const r = target.data;
      return (
        <div>
          <Row color={dot} label={r.agentName} mono={r.runId.slice(0, 12)} />
          <MetaRow
            label="Started"
            value={relativeTime(new Date(r.startedAt).toISOString())}
          />
          <MetaRow
            label="State"
            value={r.payload.status.toUpperCase()}
            tone={r.isLive ? "live" : "muted"}
          />
          <MetaRow
            label="Size"
            value={`${Math.round(r.sizeRatio * 100)}% of max`}
          />
          <ActionStack>
            <JumpButton
              label="View in Activity ↓"
              onClick={() => jumpTo("chapter-work", `run-${r.runId}`)}
            />
          </ActionStack>
        </div>
      );
    }

    case "comment": {
      const c = target.data.payload as IssueComment;
      return (
        <div>
          <Row color={dot} label={target.data.authorName} />
          <MetaRow
            label="When"
            value={relativeTime(new Date(target.data.createdAt).toISOString())}
          />
          <Body>{c.body}</Body>
          <ActionStack>
            <JumpButton
              label="View in Correspondence ↓"
              onClick={() =>
                jumpTo("chapter-correspondence", `comment-${target.data.id}`)
              }
            />
          </ActionStack>
        </div>
      );
    }

    case "event":
      return (
        <div>
          <Row color={dot} label={target.data.actorName} />
          <Body>{target.data.verb}</Body>
          <MetaRow
            label="When"
            value={relativeTime(new Date(target.data.createdAt).toISOString())}
          />
          <ActionStack>
            <JumpButton
              label="View in Activity ↓"
              onClick={() => jumpTo("chapter-work", `activity-${target.data.id}`)}
            />
          </ActionStack>
        </div>
      );

    case "approval":
      return (
        <div>
          <Row
            color={dot}
            label={target.data.status.toUpperCase()}
          />
          <MetaRow
            label="Requested"
            value={relativeTime(
              new Date(target.data.requestedAt).toISOString(),
            )}
          />
          {target.data.decidedAt && (
            <MetaRow
              label="Decided"
              value={relativeTime(
                new Date(target.data.decidedAt).toISOString(),
              )}
            />
          )}
          <ActionStack>
            <JumpButton
              label="View in Approvals ↓"
              onClick={() => {
                jumpTo("chapter-verdict", `approval-${target.data.id}`);
                // Dispatch a CustomEvent so IssueDetail can open the
                // approvals collapsible.
                window.dispatchEvent(
                  new CustomEvent("paperclip:expand-approvals"),
                );
              }}
            />
            <OpenMatterButton
              label="Open approval"
              onClick={() => {
                onClose();
                navigate(`/approvals/${target.data.id}`);
              }}
            />
          </ActionStack>
        </div>
      );
  }
}

/* ─── Atoms ─────────────────────────────────────────────────────── */

function Row({
  color,
  label,
  mono,
}: {
  color: string;
  label: string;
  mono?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-[5px] shrink-0"
        style={{ width: 8, height: 8, background: color }}
      />
      <div className="flex-1">
        {mono && (
          <div
            className="font-mono text-[0.58rem] uppercase tracking-[0.2em] mb-0.5"
            style={{ color: "var(--boared-ink-faint, inherit)" }}
          >
            {mono}
          </div>
        )}
        <div
          className="font-display italic leading-snug"
          style={{ fontSize: "1.05rem", color: "var(--boared-ink, inherit)" }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-sm leading-relaxed whitespace-pre-wrap"
      style={{
        color: "var(--boared-ink-soft, inherit)",
        maxWidth: "40ch",
      }}
    >
      {children}
    </div>
  );
}

function MetaRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "live" | "muted";
}) {
  const color =
    tone === "live"
      ? "var(--boared-acid, currentColor)"
      : tone === "muted"
        ? "var(--boared-ink-faint, inherit)"
        : "var(--boared-ink, inherit)";
  return (
    <div
      className="flex items-baseline gap-3 mt-1.5 font-mono uppercase"
      style={{
        fontSize: "0.58rem",
        letterSpacing: "0.18em",
      }}
    >
      <span style={{ color: "var(--boared-ink-faint, currentColor)" }}>
        {label}
      </span>
      <span className="flex-1 border-t border-dotted opacity-40" />
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function ActionStack({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3 pt-3 flex flex-col gap-2"
      style={{
        borderTop: "1px solid var(--boared-rule, currentColor)",
      }}
    >
      {children}
    </div>
  );
}

function JumpButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left font-mono uppercase transition-colors"
      style={{
        fontSize: "0.58rem",
        letterSpacing: "0.22em",
        padding: "6px 8px",
        background: "transparent",
        border: "1px solid var(--boared-rule, currentColor)",
        color: "var(--boared-ink, inherit)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.color = "var(--boared-acid, currentColor)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.color = "var(--boared-ink, inherit)")
      }
    >
      {label}
    </button>
  );
}

function OpenMatterButton({
  onClick,
  label = "Open matter",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left font-mono uppercase transition-all"
      style={{
        fontSize: "0.6rem",
        letterSpacing: "0.22em",
        padding: "8px 10px",
        background: "var(--boared-acid, #B22B1A)",
        color: "var(--boared-paper, #F2F0EA)",
        border: "none",
        cursor: "pointer",
      }}
    >
      {label} →
    </button>
  );
}

/**
 * Scroll to a chapter anchor, then to a specific row inside. The row
 * pulse is driven by a CSS class added via a global `data-pulse-id`
 * attribute on document.body for 1.2 s — rows watch for a match on
 * their own id to kick off their animation.
 */
function jumpTo(chapterAnchor: string, rowId: string) {
  const chapter = document.getElementById(chapterAnchor);
  if (chapter) chapter.scrollIntoView({ behavior: "smooth", block: "start" });
  // After scroll settles, zero in on the row.
  window.setTimeout(() => {
    const row = document.getElementById(rowId);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.setAttribute("data-pulse", "true");
      window.setTimeout(() => row.removeAttribute("data-pulse"), 1400);
    }
  }, 350);
}
