/* ─────────────────────────────────────────────────────────────────────
 *  SceneErrorBoundary — catches WebGL / R3F failures so a broken scene
 *  doesn't nuke the rest of the case file.
 *
 *  Triggers on:
 *    · WebGL context-pool exhaustion (happens on laptops with many
 *      open 3D tabs, or after many navigations in our preview harness)
 *    · GPU lost events that cascade before the scene can recover
 *    · any uncaught render error inside the IssueScene subtree
 *
 *  Fallback: a simple editorial card with the issue's identifier +
 *  "visualization unavailable" — the Companion and the rest of the
 *  page render exactly as before. The user never loses navigation.
 * ───────────────────────────────────────────────────────────────────── */

import { Component, type ReactNode } from "react";

interface SceneErrorBoundaryProps {
  /** Optional label shown in the fallback card (e.g. issue identifier). */
  label?: string;
  /** Optional height so the fallback occupies the same space as the
   *  scene (prevents layout shift when the scene crashes). */
  height?: string;
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): SceneErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    // Log but don't re-throw — the whole point of this boundary is to
    // keep the page useful when the 3D layer dies.
    // eslint-disable-next-line no-console
    console.warn("[IssueScene] caught:", error.message);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-2 border border-[var(--boared-rule)]"
        style={{
          height: this.props.height ?? "min(80vh, 860px)",
          background: "var(--boared-paper-2, #050508)",
          color: "var(--boared-ink-faint, #A89A70)",
          padding: "24px",
        }}
      >
        <div
          className="font-mono uppercase"
          style={{ fontSize: "0.56rem", letterSpacing: "0.3em" }}
        >
          Visualization unavailable
        </div>
        {this.props.label && (
          <div
            className="font-display italic"
            style={{ fontSize: "1.1rem", color: "var(--boared-ink, inherit)" }}
          >
            §&nbsp;{this.props.label}
          </div>
        )}
        <div
          className="text-xs text-center"
          style={{ maxWidth: 360, lineHeight: 1.5 }}
        >
          The 3D scene couldn&rsquo;t start on this device. The case file
          below still works exactly as it always has.
        </div>
      </div>
    );
  }
}
