/* ─────────────────────────────────────────────────────────────────────
 *  DailyDispatches — three framed newspaper "boxes" of vital stats.
 *
 *  Occupies the row directly under the masthead. Each box reads like
 *  a classified ad: serif label in small caps, large tabular figure,
 *  tiny inline chart, and a single-word colophon.
 *
 *  Boxes (left → right):
 *    · ON THE WIRE   — live run count
 *    · AWAITING      — blocked + in-review count
 *    · IN FLIGHT     — in_progress count
 *
 *  Boxes are hairline-framed with corner ornaments drawn in CSS.
 * ───────────────────────────────────────────────────────────────────── */

import type { Issue } from "@paperclipai/shared";

interface DailyDispatchesProps {
  issues: Issue[];
  liveIssueIds: Set<string>;
}

interface Dispatch {
  kicker: string;
  figure: number;
  unit: string;
  blurb: string;
  tone: "ink" | "acid" | "neutral";
  bars: number[]; // 0..1 sparkline values
}

function buildDispatches(
  issues: Issue[],
  liveIds: Set<string>,
): Dispatch[] {
  const statusCount = (s: string) =>
    issues.filter((i) => i.status === s).length;
  const inFlight = statusCount("in_progress");
  const blocked = statusCount("blocked");
  const review = statusCount("in_review");
  const todo = statusCount("todo");
  const backlog = statusCount("backlog");
  const done = statusCount("done");

  // Sparkline: normalize counts across the 6 statuses.
  const raw = [backlog, todo, inFlight, review, blocked, done];
  const max = Math.max(1, ...raw);
  const bars = raw.map((n) => n / max);

  return [
    {
      kicker: "On the wire",
      figure: liveIds.size,
      unit: liveIds.size === 1 ? "run" : "runs",
      blurb: liveIds.size > 0 ? "In flight at press" : "Wire is quiet",
      tone: liveIds.size > 0 ? "acid" : "neutral",
      bars,
    },
    {
      kicker: "Awaiting you",
      figure: blocked + review,
      unit: "matters",
      blurb:
        blocked > 0 && review > 0
          ? `${blocked} stuck · ${review} in review`
          : blocked > 0
            ? `${blocked} stuck at the desk`
            : review > 0
              ? `${review} under review`
              : "Nothing to sign off",
      tone: blocked > 0 ? "acid" : "ink",
      bars,
    },
    {
      kicker: "In flight",
      figure: inFlight,
      unit: inFlight === 1 ? "matter" : "matters",
      blurb: inFlight > 0 ? "Agents are working" : "No matter is in hand",
      tone: "ink",
      bars,
    },
  ];
}

export function DailyDispatches({ issues, liveIssueIds }: DailyDispatchesProps) {
  const dispatches = buildDispatches(issues, liveIssueIds);

  return (
    <section className="gazette-dispatches" aria-label="Daily dispatches">
      {dispatches.map((d) => (
        <div key={d.kicker} className={`gazette-dispatch gazette-dispatch-${d.tone}`}>
          <span className="gazette-dispatch-corner gazette-dispatch-corner-tl" />
          <span className="gazette-dispatch-corner gazette-dispatch-corner-tr" />
          <span className="gazette-dispatch-corner gazette-dispatch-corner-bl" />
          <span className="gazette-dispatch-corner gazette-dispatch-corner-br" />

          <div className="gazette-dispatch-kicker">{d.kicker}</div>
          <div className="gazette-dispatch-figure">
            <span className="gazette-dispatch-num gazette-tabular">
              {String(d.figure).padStart(2, "0")}
            </span>
            <span className="gazette-dispatch-unit">{d.unit}</span>
          </div>

          {/* Inline sparkbars — 6 hairline columns. */}
          <div className="gazette-spark" aria-hidden="true">
            {d.bars.map((v, i) => (
              <span
                key={i}
                className="gazette-spark-bar"
                style={{ height: `${Math.max(4, v * 100)}%` }}
              />
            ))}
          </div>

          <div className="gazette-dispatch-blurb">
            <span aria-hidden="true" className="gazette-dispatch-dash">—</span>
            {d.blurb}
          </div>
        </div>
      ))}
    </section>
  );
}
