/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion / ChapterFocus — the chapter-specific mode.
 *
 *  Shown when scroll-spy lands on a chapter other than "overview" and
 *  nothing is selected. Each chapter gets its own curated mini-list:
 *
 *    lineage         → ancestor chain (top 5)
 *    work            → live + recent runs (top 5)
 *    discussion      → recent comments (top 5)
 *    subtasks        → direct child issues (top 6)
 *    verdict         → approvals + next-action CTA
 *
 *  Each row has the same affordances as below-fold rows: colored dot,
 *  hover halo bridge (writes hoverTarget to ref-store via
 *  useSetHover), and click = selectAndFocus → Inspector mode.
 *
 *  Shrinks the Companion's scroll-depth so the user can see the chapter
 *  content at a glance without scrolling inside the panel.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type { Chapter } from "../../data/chapters";
import type { IssueGraph, SceneTarget } from "../../data/types";
import type { Narrative } from "../../scene/narrative";
import { colorForNode } from "../../colors";
import {
  useSceneActions,
  useSetHover,
  targetToRef,
} from "../../state/SceneStateContext";
import { CompanionHeader } from "./header";
import { NextActionButton } from "./NextActionButton";
import { relativeTime } from "../../../../lib/utils";

interface ChapterFocusProps {
  chapter: Chapter;
  graph: IssueGraph;
  narrative: Narrative;
  onNextAction?: () => void;
  onClose: () => void;
}

export function ChapterFocus({
  chapter,
  graph,
  narrative,
  onNextAction,
  onClose,
}: ChapterFocusProps) {
  const actions = useSceneActions();
  const setHover = useSetHover();

  const handleSelect = (target: SceneTarget) => {
    actions.selectAndFocus(target);
  };

  const body = useMemo(() => {
    switch (chapter.key) {
      case "lineage":
        return (
          <List
            items={graph.ancestors.slice(0, 5).map((a) => ({
              key: a.id,
              target: { kind: "ancestor", data: a } satisfies SceneTarget,
              primary: a.title,
              secondary: `§ ${a.identifier} · ${a.status
                .toUpperCase()
                .replace(/_/g, " ")}`,
            }))}
            onSelect={handleSelect}
            setHover={setHover}
            empty="No parent matters."
          />
        );

      case "work": {
        const live = graph.runs.filter((r) => r.isLive);
        const rest = graph.runs
          .filter((r) => !r.isLive)
          .sort((a, b) => b.startedAt - a.startedAt);
        const top = [...live, ...rest].slice(0, 5);
        return (
          <List
            items={top.map((r) => ({
              key: r.runId,
              target: { kind: "run", data: r } satisfies SceneTarget,
              primary: r.agentName,
              secondary: `${r.isLive ? "Live · " : ""}${relativeTime(
                new Date(r.startedAt).toISOString(),
              )} · ${Math.round(r.sizeRatio * 100)}%`,
              live: r.isLive,
            }))}
            onSelect={handleSelect}
            setHover={setHover}
            empty="No runs yet."
          />
        );
      }

      case "discussion": {
        const top = [...graph.comments]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5);
        return (
          <List
            items={top.map((c) => ({
              key: c.id,
              target: { kind: "comment", data: c } satisfies SceneTarget,
              primary: c.authorName,
              secondary: `${relativeTime(
                new Date(c.createdAt).toISOString(),
              )} · ${c.bodyPreview}`,
            }))}
            onSelect={handleSelect}
            setHover={setHover}
            empty="No correspondence yet."
          />
        );
      }

      case "subtasks": {
        const top = graph.descendants.slice(0, 6);
        return (
          <List
            items={top.map((d) => ({
              key: d.id,
              target: { kind: "descendant", data: d } satisfies SceneTarget,
              primary: d.title,
              secondary: `§ ${d.identifier} · ${d.status
                .toUpperCase()
                .replace(/_/g, " ")}${d.kind === "mention" ? " · mention" : ""}`,
            }))}
            onSelect={handleSelect}
            setHover={setHover}
            empty="No sub-matters yet."
          />
        );
      }

      case "verdict": {
        const pending = graph.approvals.filter((a) => a.status === "pending");
        const decided = graph.approvals.filter((a) => a.status !== "pending");
        return (
          <div className="space-y-3">
            {pending.length > 0 && (
              <List
                items={pending.slice(0, 3).map((a) => ({
                  key: a.id,
                  target: { kind: "approval", data: a } satisfies SceneTarget,
                  primary: "Awaiting decision",
                  secondary: `Requested ${relativeTime(
                    new Date(a.requestedAt).toISOString(),
                  )}`,
                }))}
                onSelect={handleSelect}
                setHover={setHover}
                empty=""
              />
            )}
            {decided.length > 0 && (
              <>
                <div
                  className="font-mono uppercase mt-2"
                  style={{
                    fontSize: "0.5rem",
                    letterSpacing: "0.3em",
                    color: "var(--boared-ink-faint, inherit)",
                  }}
                >
                  Decided
                </div>
                <List
                  items={decided.slice(0, 3).map((a) => ({
                    key: a.id,
                    target: { kind: "approval", data: a } satisfies SceneTarget,
                    primary: a.status.toUpperCase(),
                    secondary: a.decidedAt
                      ? relativeTime(new Date(a.decidedAt).toISOString())
                      : "—",
                  }))}
                  onSelect={handleSelect}
                  setHover={setHover}
                  empty=""
                />
              </>
            )}
            {narrative.nextAction && onNextAction && (
              <div className="mt-3">
                <NextActionButton
                  nextAction={narrative.nextAction}
                  onClick={onNextAction}
                />
              </div>
            )}
            {pending.length === 0 &&
              decided.length === 0 &&
              !narrative.nextAction && (
                <div
                  className="text-center py-4"
                  style={{
                    color: "var(--boared-ink-faint, inherit)",
                    fontSize: "0.78rem",
                  }}
                >
                  Nothing outstanding.
                </div>
              )}
          </div>
        );
      }

      default:
        return null;
    }
  }, [chapter.key, graph, narrative, onNextAction, setHover]);

  return (
    <div>
      <CompanionHeader
        title={`Chapter ${chapter.numeral}`}
        subtitle={chapter.title}
        onClose={onClose}
        closeLabel="Back to overview"
      />
      <div
        className="mb-3 text-center font-display italic"
        style={{ fontSize: "0.9rem", color: "var(--boared-ink-soft, inherit)" }}
      >
        {chapter.blurb}
      </div>
      {body}
    </div>
  );
}

/* ─── List atom ─────────────────────────────────────────────────── */

interface ListItem {
  key: string;
  target: SceneTarget;
  primary: string;
  secondary: string;
  live?: boolean;
}

function List({
  items,
  onSelect,
  setHover,
  empty,
}: {
  items: ListItem[];
  onSelect: (t: SceneTarget) => void;
  setHover: (r: { kind: SceneTarget["kind"]; id: string } | null) => void;
  empty: string;
}) {
  if (items.length === 0) {
    if (!empty) return null;
    return (
      <div
        className="text-center py-4"
        style={{
          color: "var(--boared-ink-faint, inherit)",
          fontSize: "0.78rem",
        }}
      >
        {empty}
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.key}>
          <button
            type="button"
            onClick={() => onSelect(it.target)}
            onMouseEnter={() => setHover(targetToRef(it.target))}
            onMouseLeave={() => setHover(null)}
            className="w-full text-left flex items-start gap-2 transition-colors"
            style={{
              padding: "6px 8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--boared-ink, inherit)",
              borderLeft: "2px solid transparent",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background =
                "var(--boared-paper-2, transparent)";
              e.currentTarget.style.borderLeftColor =
                "var(--boared-acid, currentColor)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderLeftColor = "transparent";
            }}
          >
            <span
              aria-hidden
              className="mt-[5px] shrink-0"
              style={{
                width: 6,
                height: 6,
                background: colorForNode(it.target),
                boxShadow: it.live
                  ? `0 0 6px ${colorForNode(it.target)}`
                  : undefined,
              }}
            />
            <span className="flex-1 min-w-0">
              <span
                className="block truncate text-sm"
                style={{ color: "var(--boared-ink, inherit)" }}
              >
                {it.primary}
              </span>
              <span
                className="block truncate font-mono"
                style={{
                  fontSize: "0.58rem",
                  letterSpacing: "0.08em",
                  color: "var(--boared-ink-faint, inherit)",
                  marginTop: 2,
                }}
              >
                {it.secondary}
              </span>
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
  );
}
