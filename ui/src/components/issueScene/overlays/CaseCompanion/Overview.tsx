/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion / Overview — the default mode.
 *
 *  Shown when nothing is selected, no chapter is active, no search,
 *  no tour. Contents:
 *    · Plain-English summary (Fraunces italic)
 *    · How to read this (legend)
 *    · Chapters TOC
 *    · Ask Papee block
 *    · Next-Action CTA (real dispatcher)
 *    · Take the tour (optional)
 *
 *  Reads graph + narrative from SceneStateContext; dispatches the
 *  chapter-select and next-action through useSceneActions.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type { Issue } from "@paperclipai/shared";
import type { Narrative } from "../../scene/narrative";
import type { Chapter } from "../../data/chapters";
import { CompanionPlainEnglish } from "../CompanionPlainEnglish";
import { CompanionLegend } from "../CompanionLegend";
import { CompanionChapters } from "../CompanionChapters";
import { PapeeNarrator } from "../PapeeNarrator";
import { CompanionHeader } from "./header";
import { NextActionButton } from "./NextActionButton";
import { useSceneActions } from "../../state/SceneStateContext";

interface OverviewProps {
  issue: Issue;
  narrative: Narrative;
  chapters: Chapter[];
  activeChapterKey?: string | null;
  onTakeTour?: () => void;
  /** Handler for the Next-Action CTA; parent wires to real destinations. */
  onNextAction?: () => void;
}

export function Overview({
  issue,
  narrative,
  chapters,
  activeChapterKey,
  onTakeTour,
  onNextAction,
}: OverviewProps) {
  const actions = useSceneActions();

  const handleChapterSelect = useMemo(
    () => (chapter: Chapter) => {
      // Scroll to anchor; useScrollChoreography picks up the pose.
      const el = document.getElementById(chapter.anchorId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Also push the canonical chapter pose immediately (avoid waiting
      // for IO debounce) and stamp activeChapterKey so Companion mode
      // switches to chapter-focus in the same tick.
      actions.setTargetPose(chapter.pose);
      actions.setActiveChapterKey(chapter.key);
    },
    [actions],
  );

  return (
    <div>
      <CompanionHeader title="The Case Companion" narrative={narrative} />

      <div className="space-y-5">
        <CompanionPlainEnglish issue={issue} narrative={narrative} />

        <HRule />
        <CompanionLegend />

        <HRule />
        <CompanionChapters
          chapters={chapters}
          activeKey={activeChapterKey}
          onSelect={handleChapterSelect}
        />

        {narrative.nextAction && onNextAction && (
          <>
            <HRule />
            <section
              className="boared-reveal"
              style={{ animationDelay: "320ms" }}
            >
              <div
                className="font-mono uppercase mb-2"
                style={{
                  fontSize: "0.56rem",
                  letterSpacing: "0.32em",
                  color: "var(--boared-ink-faint, currentColor)",
                }}
              >
                Your next action
              </div>
              <NextActionButton
                nextAction={narrative.nextAction}
                onClick={onNextAction}
              />
            </section>
          </>
        )}

        <HRule />
        <PapeeNarrator issue={issue} narrative={narrative} />

        {onTakeTour && (
          <>
            <HRule />
            <TakeTheTourButton onClick={onTakeTour} />
          </>
        )}
      </div>
    </div>
  );
}

function HRule() {
  return (
    <hr
      aria-hidden="true"
      style={{
        border: 0,
        borderTop: "1px solid var(--boared-rule, currentColor)",
        opacity: 0.55,
        margin: 0,
      }}
    />
  );
}

function TakeTheTourButton({ onClick }: { onClick: () => void }) {
  return (
    <section className="boared-reveal" style={{ animationDelay: "360ms" }}>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left font-mono uppercase transition-colors"
        style={{
          fontSize: "0.58rem",
          letterSpacing: "0.28em",
          padding: "10px 0",
          color: "var(--boared-ink-faint, currentColor)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderTop: "1px solid var(--boared-rule, currentColor)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--boared-acid, currentColor)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color =
            "var(--boared-ink-faint, currentColor)";
        }}
      >
        Take the tour &nbsp;↘
      </button>
    </section>
  );
}
