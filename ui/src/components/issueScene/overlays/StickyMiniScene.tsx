/* ─────────────────────────────────────────────────────────────────────
 *  StickyMiniScene — a small pinned scene tile for when the hero
 *  has scrolled out of view.
 *
 *  Cheap to render:
 *    · Second <IssueScene> instance with mode="mini"
 *    · The mini mode disables the EffectComposer, reduces dpr, drops
 *      HUD, keeps just the 3D scene itself
 *    · The tile appears with a fade+scale when the hero leaves
 *      viewport and disappears when it returns
 *    · Clicking the tile scrolls back to the hero (smooth)
 *
 *  Positioned fixed top-right of the viewport with a small rule/label.
 *  Respects mobile: hidden below the lg breakpoint (< 1024px) — small
 *  screens don't have the real estate for a persistent tile.
 * ───────────────────────────────────────────────────────────────────── */

import type {
  Issue,
  IssueComment,
  ActivityEvent,
  Agent,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";
import type { CameraPoseKey } from "../scene/cinematography";
import { IssueScene } from "../IssueScene";

interface StickyMiniSceneProps {
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
  /** Pose to lerp to — follows scroll choreography. */
  targetPose: CameraPoseKey | null;
  /** True when the hero has scrolled above the top edge. */
  visible: boolean;
  /** Fires on click — parent scrolls back to the top. */
  onReturnToTop: () => void;
}

export function StickyMiniScene(props: StickyMiniSceneProps) {
  const { visible, onReturnToTop } = props;

  return (
    <div
      aria-hidden={!visible}
      className="hidden lg:block fixed z-40"
      style={{
        top: 18,
        right: 18,
        width: 248,
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? 0 : -6}px) scale(${visible ? 1 : 0.96})`,
        transition:
          "opacity 450ms cubic-bezier(0.22, 1, 0.36, 1), transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Eyebrow row */}
      <div
        className="font-mono uppercase flex items-center gap-2 mb-1.5"
        style={{
          fontSize: "0.48rem",
          letterSpacing: "0.3em",
          color: "var(--boared-ink-faint, #A89A70)",
        }}
      >
        <span
          className="block h-px flex-1"
          style={{
            background: "var(--boared-rule, currentColor)",
            opacity: 0.5,
          }}
        />
        <span>§ Case</span>
        <span
          className="block h-px flex-1"
          style={{
            background: "var(--boared-rule, currentColor)",
            opacity: 0.5,
          }}
        />
      </div>

      {/* Tile */}
      <button
        type="button"
        onClick={onReturnToTop}
        aria-label="Return to case file top"
        className="block w-full text-left relative"
        style={{
          padding: 0,
          background: "transparent",
          border: "1px solid var(--boared-rule, rgba(245,233,203,0.25))",
          cursor: "pointer",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor =
            "var(--boared-acid, #FF6B4A)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor =
            "var(--boared-rule, rgba(245,233,203,0.25))";
        }}
      >
        <IssueScene
          {...props}
          height="140px"
          ledgerCompact
          mode="mini"
          targetPose={props.targetPose}
        />

        {/* "↑ return" corner chip */}
        <span
          className="absolute font-mono uppercase pointer-events-none"
          style={{
            top: 6,
            right: 8,
            fontSize: "0.42rem",
            letterSpacing: "0.28em",
            color: "#F5E9CB",
            background: "rgba(8,8,12,0.72)",
            padding: "2px 6px",
            border: "1px solid rgba(245,233,203,0.28)",
          }}
        >
          ↑ Top
        </span>
      </button>
    </div>
  );
}
