/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion — the right-column panel.
 *
 *  After the unification refactor this component is a THIN ROUTER. It
 *  reads from SceneStateContext + guided-tour + scroll-choreography,
 *  derives a mode via modeOf(), and delegates rendering to one of:
 *    · Overview      — default: plain-English, legend, chapters, CTA
 *    · Inspector     — something is selected in the 3D scene or a row
 *    · ChapterFocus  — scroll-spy landed on a specific chapter
 *    · Search        — user has typed a query
 *    · TourBreadcrumb — guided tour is playing
 *
 *  The Companion panel's outer chrome (frame, paper background, padding)
 *  stays stable across modes so the user's visual anchor doesn't move.
 *  Sub-components are responsible for their own header + body.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type {
  Issue,
  IssueComment,
  ActivityEvent,
  Agent,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";
import type { Chapter } from "../data/chapters";
import { useSceneActions, useSceneState } from "../state/SceneStateContext";
import type { Narrative } from "../scene/narrative";
import { modeOf } from "./CaseCompanion/modeOf";
import { Overview } from "./CaseCompanion/Overview";
import { Inspector } from "./CaseCompanion/Inspector";
import { ChapterFocus } from "./CaseCompanion/ChapterFocus";
import { Search } from "./CaseCompanion/Search";
import { TourBreadcrumb } from "./CaseCompanion/TourBreadcrumb";

interface CaseCompanionProps {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  linkedApprovals?: Array<{
    id: string;
    status: string;
    requestedAt?: Date | string | null;
    decidedAt?: Date | string | null;
  }>;
  /** Pre-computed narrative and chapters — required. The parent
   *  (IssueSceneBlock) computes these ONCE and passes them to both the
   *  Companion and the scene so they share the same memoised view. */
  narrative: Narrative;
  chapters: Chapter[];
  /** Tour state — the TourPlayer overlay is mounted at the page level,
   *  but the Companion needs to know whether to flip to the tour mode. */
  tourCurrent: Chapter | null;
  onTakeTour?: () => void;
  onCancelTour?: () => void;
  /** Handler for the Next-Action CTA. Wired by parent to real
   *  destinations (scroll to approvals / focus composer / fly to run). */
  onNextAction?: () => void;
  className?: string;
}

export function CaseCompanion(props: CaseCompanionProps) {
  const {
    issue,
    narrative,
    chapters,
    tourCurrent,
    onTakeTour,
    onCancelTour,
    onNextAction,
    className,
  } = props;

  const state = useSceneState();
  const actions = useSceneActions();

  const mode = useMemo(
    () =>
      modeOf({
        tourRunning: state.tourRunning,
        searchQuery: state.searchQuery,
        hasSelection: !!state.selection,
        activeChapterKey: state.activeChapterKey,
      }),
    [
      state.tourRunning,
      state.searchQuery,
      state.selection,
      state.activeChapterKey,
    ],
  );

  const activeChapter = useMemo(
    () =>
      state.activeChapterKey
        ? chapters.find((c) => c.key === state.activeChapterKey) ?? null
        : null,
    [chapters, state.activeChapterKey],
  );

  return (
    <aside
      className={className}
      style={{
        padding: "18px 20px 22px",
        border: "1px solid var(--boared-rule, currentColor)",
        background: "var(--boared-paper, transparent)",
        color: "var(--boared-ink, inherit)",
        position: "relative",
        overflow: "hidden",
        minHeight: 420,
      }}
    >
      {mode === "tour" && (
        <TourBreadcrumb
          chapters={chapters}
          current={tourCurrent}
          onCancel={onCancelTour ?? (() => undefined)}
        />
      )}

      {mode === "search" && (
        <Search
          graph={state.graph}
          query={state.searchQuery}
          onClose={() => actions.setSearch("")}
        />
      )}

      {mode === "inspector" && state.selection && (
        <Inspector
          target={state.selection}
          onClose={() => actions.select(null)}
        />
      )}

      {mode === "chapter" && activeChapter && (
        <ChapterFocus
          chapter={activeChapter}
          graph={state.graph}
          narrative={narrative}
          onNextAction={onNextAction}
          onClose={() => actions.setActiveChapterKey("overview")}
        />
      )}

      {mode === "overview" && (
        <Overview
          issue={issue}
          narrative={narrative}
          chapters={chapters}
          activeChapterKey={state.activeChapterKey}
          onTakeTour={onTakeTour}
          onNextAction={onNextAction}
        />
      )}
    </aside>
  );
}
