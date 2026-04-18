/* ─────────────────────────────────────────────────────────────────────
 *  TitleCard — cinematic intro caption for the IssueScene.
 *
 *  Plays once at mount, aligned with CameraIntro's dolly-in:
 *    0.0s : fade starts
 *    0.6s : fully visible, camera is halfway in
 *    1.9s : begin fade out
 *    2.7s : gone, hand-off to the user
 *
 *  Lines, in order of increasing font size:
 *    · CASE FILE LABEL (small caps, creamDim)
 *    · IDENTIFIER  (mono, cream)
 *    · TITLE       (big serif, cream)
 *    · STATUS · AGE (small caps, color-matched to mood)
 *    · ORBIT · PAN · ZOOM  (tiny instruction cue that fades last)
 *
 *  Uses no 3D, no canvas — just a pointer-events:none DOM layer over
 *  the canvas so it composites cleanly under the other HUD overlays.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { Issue } from "@paperclipai/shared";
import type { Atmosphere } from "../scene/atmosphere";
import { SCENE, statusColor } from "../colors";

interface TitleCardProps {
  issue: Issue;
  atmo: Atmosphere;
}

const MOOD_ACCENT: Record<Atmosphere["mood"], string> = {
  urgent: "#ff6b6b",
  alert: "#f59e0b",
  serene: "#7ee4d8",
  neutral: SCENE.cream,
};

export function TitleCard({ issue, atmo }: TitleCardProps) {
  // Opacity driven by a 0→1→0 envelope. We keep it in state so the
  // render cycle handles the transition smoothly rather than animating
  // with raw CSS keyframes (which would restart awkwardly on re-mounts).
  const [phase, setPhase] = useState<"in" | "hold" | "out" | "done">("in");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("hold"), 650);
    const t2 = window.setTimeout(() => setPhase("out"), 1900);
    const t3 = window.setTimeout(() => setPhase("done"), 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  if (phase === "done") return null;

  const opacity = phase === "in" ? 0 : phase === "hold" ? 1 : 0;
  const transitionIn = phase === "in" ? 0.65 : phase === "out" ? 0.8 : 0;
  const transform =
    phase === "in"
      ? "translateY(12px) scale(0.985)"
      : "translateY(0) scale(1)";

  const accent = MOOD_ACCENT[atmo.mood];
  const statusHex = statusColor(issue.status);

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
      style={{
        opacity,
        transform,
        transition: `opacity ${transitionIn}s ease, transform ${transitionIn}s ease`,
      }}
    >
      {/* Radial ink bleed — gives the title card a subtle matte it
          composites against so text stays legible over the scene. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, ${hexToRgba(atmo.fogColor, 0.55)} 0%, ${hexToRgba(atmo.fogColor, 0)} 58%)`,
        }}
      />
      <div className="relative flex flex-col items-center text-center px-6 max-w-[92%]">
        {/* Thin top rule + CASE FILE eyebrow */}
        <div className="flex items-center gap-3 mb-3">
          <span
            className="block h-px w-10"
            style={{ background: SCENE.creamDim, opacity: 0.6 }}
          />
          <span
            className="font-mono text-[0.56rem] uppercase tracking-[0.32em]"
            style={{ color: SCENE.creamDim }}
          >
            Case File · Opened
          </span>
          <span
            className="block h-px w-10"
            style={{ background: SCENE.creamDim, opacity: 0.6 }}
          />
        </div>

        {/* Identifier — mono, wide tracking, always uppercase */}
        <div
          className="font-mono text-[0.85rem] uppercase tracking-[0.28em] mb-3"
          style={{ color: SCENE.cream }}
        >
          §&nbsp;{issue.identifier ?? issue.id.slice(0, 8)}
        </div>

        {/* Title — the headline. Clamp to 2 lines so a novelette of a
            title doesn't destroy the cinematic read. */}
        <h2
          className="font-serif italic leading-[1.1] mb-4"
          style={{
            color: SCENE.cream,
            fontSize: "clamp(1.2rem, 3.2vw, 2.1rem)",
            maxWidth: "28ch",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textShadow: `0 0 24px ${hexToRgba(accent, 0.45)}`,
          }}
        >
          {issue.title}
        </h2>

        {/* Status · age tagline */}
        <div
          className="font-mono text-[0.62rem] uppercase tracking-[0.28em] flex items-center gap-3"
          style={{ color: accent }}
        >
          <StatusDot color={statusHex} />
          <span>{atmo.statusPhrase}</span>
          <span style={{ color: SCENE.creamDim }}>·</span>
          <span>{atmo.tagline}</span>
        </div>

        {/* Interaction hint — tiniest row, fades with the card. */}
        <div
          className="mt-6 font-mono text-[0.5rem] uppercase tracking-[0.38em] flex items-center gap-4"
          style={{ color: SCENE.creamDim, opacity: 0.75 }}
        >
          <span>Orbit</span>
          <span className="opacity-50">·</span>
          <span>Pan</span>
          <span className="opacity-50">·</span>
          <span>Zoom</span>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block"
      style={{
        width: 7,
        height: 7,
        borderRadius: 0,
        background: color,
        boxShadow: `0 0 10px ${color}`,
      }}
    />
  );
}

/** Minimal #RRGGBB → rgba(r,g,b,a). Returns transparent for malformed
 *  input so a bad palette value never blanks the card. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
