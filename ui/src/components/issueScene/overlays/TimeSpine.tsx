/* ─────────────────────────────────────────────────────────────────────
 *  TimeSpine — horizontal timeline ribbon at the top of the scene.
 *
 *  Shows chronological milestones the user can read at a glance:
 *
 *      Opened ───●──●─────────●────── Now
 *       5d ago  first    first    last
 *               run      comment  action
 *
 *  Renders only when ≥ 2 milestones exist (the baseline is created+now,
 *  which would produce a trivial "Opened → Now" bar that adds nothing).
 *
 *  Uses linear time mapping between `milestones[0].timestamp` and
 *  `milestones[last].timestamp`. "Now" is always the rightmost pin,
 *  "Opened" is always the leftmost — the other pins land where they
 *  actually happened, so sparsity on the left vs. right tells a story
 *  ("everything happened on day one" vs "activity has been constant").
 * ───────────────────────────────────────────────────────────────────── */

import type { Narrative, NarrativeMilestone } from "../scene/narrative";
import { SCENE } from "../colors";

interface TimeSpineProps {
  narrative: Narrative;
  visible: boolean;
}

const PIN_COLOR: Record<NarrativeMilestone["kind"], string> = {
  created: "#F5E9CB",     // cream — the start
  firstRun: "#F59E0B",    // amber — run color
  firstComment: "#A78BFA", // violet — comment color
  lastActivity: "#34D399", // green — "life"
  now: "#FF6B4A",          // acid — "you are here"
};

export function TimeSpine({ narrative, visible }: TimeSpineProps) {
  const { milestones } = narrative;
  if (milestones.length < 3) {
    // Trivially "created + now" produces no story — suppress it.
    return null;
  }

  const tStart = milestones[0].timestamp;
  const tEnd = milestones[milestones.length - 1].timestamp;
  const span = Math.max(1, tEnd - tStart);

  // Compute x% for each pin, then coalesce any pair whose separation is
  // < 5% to avoid visually stacked labels.
  const raw = milestones.map((m) => ({
    pct: ((m.timestamp - tStart) / span) * 100,
    m,
  }));
  // Coalesce: if a pin is within 5% of the previous, bump it right.
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].pct - raw[i - 1].pct < 5) {
      raw[i].pct = raw[i - 1].pct + 5;
    }
  }
  // Clamp the final pin back to 100 (lossily — "now" is a fixed anchor).
  raw[raw.length - 1].pct = 100;

  return (
    <div
      className="absolute left-1/2 z-10 pointer-events-none"
      style={{
        top: 86, // sits below StatsStrip + CountsStrip
        transform: `translate(-50%, ${visible ? 0 : -6}px)`,
        opacity: visible ? 1 : 0,
        transition:
          "opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        width: "min(560px, calc(100% - 220px))",
      }}
    >
      {/* Track */}
      <div className="relative" style={{ height: 1 }}>
        <div
          className="absolute left-0 right-0 top-0"
          style={{
            height: 1,
            background: `linear-gradient(90deg, rgba(245,233,203,0.08) 0%, rgba(245,233,203,0.45) 8%, rgba(245,233,203,0.45) 92%, rgba(245,233,203,0.08) 100%)`,
          }}
        />

        {/* Pins */}
        {raw.map(({ pct, m }) => {
          const color = PIN_COLOR[m.kind];
          const isNow = m.kind === "now";
          return (
            <div
              key={m.kind + m.timestamp}
              className="absolute"
              style={{
                left: `${pct}%`,
                top: 0,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                style={{
                  width: isNow ? 9 : 7,
                  height: isNow ? 9 : 7,
                  background: color,
                  boxShadow: `0 0 10px ${color}, 0 0 2px ${color}`,
                  borderRadius: 0,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels — alternate above/below to avoid collision for dense
          clusters. Pattern: 0 above, 1 below, 2 above, … "Now" and
          "Opened" always go below. */}
      <div className="relative" style={{ marginTop: 6, height: 28 }}>
        {raw.map(({ pct, m }, i) => {
          const color = PIN_COLOR[m.kind];
          const showBelow =
            m.kind === "created" ||
            m.kind === "now" ||
            i % 2 === 1;
          return (
            <div
              key={m.kind + "-label"}
              className="absolute font-mono uppercase text-center leading-[1.15]"
              style={{
                left: `${pct}%`,
                top: showBelow ? 0 : -36,
                transform: "translate(-50%, 0)",
                color,
                fontSize: "0.48rem",
                letterSpacing: "0.2em",
                whiteSpace: "nowrap",
                textShadow: `0 0 6px ${color}55`,
              }}
            >
              <div>{m.label}</div>
              <div
                style={{
                  color: SCENE.creamDim,
                  opacity: 0.75,
                  fontSize: "0.44rem",
                  letterSpacing: "0.2em",
                  marginTop: 1,
                }}
              >
                {m.agoPhrase}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
