/* ─────────────────────────────────────────────────────────────────────
 *  TimeRings — chronological tick marks on the equator.
 *
 *  The sphere already places runs, comments, and events at azimuths
 *  computed from timeToAzimuth(ts, now, window). This component draws
 *  the *reference marks* at canonical durations (1h / 1d / 1w / 1mo)
 *  so the user can eyeball "this run is roughly a day old" without
 *  clicking.
 *
 *  Each tick is:
 *    · a short cream radial tick extending outward from the run shell
 *    · a drei <Text> label naming the duration
 *
 *  Pure geometry, no user interaction — the ticks recede into the
 *  scene at low opacity so they decorate without dominating.
 * ───────────────────────────────────────────────────────────────────── */

import { Text, Line } from "@react-three/drei";
import { SCENE } from "../colors";
import { LAYOUT, timeToAzimuth } from "../data/layout";
import type { IssueGraph } from "../data/types";

interface TimeRingsProps {
  graph: IssueGraph;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/** Canonical durations shown as reference ticks, in milliseconds. */
const TICKS: Array<{ ms: number; label: string }> = [
  { ms: 1 * HOUR, label: "1h" },
  { ms: 6 * HOUR, label: "6h" },
  { ms: 1 * DAY, label: "1d" },
  { ms: 1 * WEEK, label: "1w" },
  { ms: 1 * MONTH, label: "1mo" },
];

export function TimeRings({ graph }: TimeRingsProps) {
  const nowMs = Math.max(graph.timeRange.end, Date.now());
  const windowMs = Math.max(
    60 * 60 * 1000,
    graph.timeRange.end - graph.timeRange.start,
  );

  const rInner = LAYOUT.RUN_RADIUS - 0.25;
  const rOuter = LAYOUT.COMMENT_RADIUS + 0.25;
  const labelR = LAYOUT.COMMENT_RADIUS + 0.85;

  return (
    <group>
      {TICKS.map(({ ms, label }) => {
        const age = nowMs - ms;
        const az = timeToAzimuth(age, nowMs, windowMs);
        // Skip if the tick wraps past the horizon (older than the windowed axis).
        if (Math.abs(az) > Math.PI * 2 * 0.95) return null;

        const x1 = Math.cos(az) * rInner;
        const y1 = Math.sin(az) * rInner;
        const x2 = Math.cos(az) * rOuter;
        const y2 = Math.sin(az) * rOuter;
        const lx = Math.cos(az) * labelR;
        const ly = Math.sin(az) * labelR;

        return (
          <group key={label}>
            <Line
              points={[
                [x1, y1, 0],
                [x2, y2, 0],
              ]}
              color={SCENE.cream}
              lineWidth={0.015}
              transparent
              opacity={0.28}
            />
            <Text
              position={[lx, ly, 0]}
              color={SCENE.cream}
              fontSize={0.24}
              anchorX="center"
              anchorY="middle"
              fillOpacity={0.42}
              letterSpacing={0.18}
              outlineColor="#000"
              outlineOpacity={0.55}
              outlineWidth={0.005}
            >
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
