/* ─────────────────────────────────────────────────────────────────────
 *  IssuesMasthead — broadsheet nameplate for the /issues page.
 *
 *  Presents the Issues index as a daily paper's front page. Nameplate
 *  in Fraunces italic, flanked by a left "dateline" (weekday · date)
 *  and a right "edition" block (Vol/No based on counts). Double rule
 *  above the title, single hairline below.
 *
 *  This is pure presentation — data-free except for the counts it
 *  receives for the right-side edition block.
 * ───────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";

interface IssuesMastheadProps {
  /** Total entries on file. Drives the edition number. */
  totalEntries: number;
  /** Live count shown as a small "bulletin" next to the nameplate. */
  liveCount: number;
  /** Right-hand CTA — typically the New Issue button. */
  rightSlot?: ReactNode;
}

function formatDateline(d: Date): {
  weekday: string;
  long: string;
  iso: string;
} {
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const long = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const iso = d.toISOString().slice(0, 10);
  return { weekday, long, iso };
}

export function IssuesMasthead({
  totalEntries,
  liveCount,
  rightSlot,
}: IssuesMastheadProps) {
  const date = formatDateline(new Date());
  // Edition math: volume = floor(totalEntries / 100) + I, no = totalEntries.
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const vol = roman[Math.min(roman.length - 1, Math.floor(totalEntries / 50))];

  return (
    <div className="gazette-masthead">
      {/* Double rule above */}
      <div className="gazette-rule-double" />

      {/* Row 1: flag + edition info */}
      <div className="gazette-masthead-row">
        <div className="gazette-dateline">
          <span className="gazette-dateline-label">Dispatched</span>
          <span className="gazette-dateline-day">{date.weekday}</span>
          <span className="gazette-dateline-date">{date.long}</span>
        </div>

        <div className="gazette-flag">
          <span className="gazette-flag-super">The Boared</span>
          <h1 className="gazette-flag-name">Docket</h1>
          <span className="gazette-flag-sub">
            Matters before the desk — a daily broadsheet
          </span>
        </div>

        <div className="gazette-edition">
          <div className="gazette-edition-row">
            <span className="gazette-edition-k">Vol.</span>
            <span className="gazette-edition-v">{vol}</span>
          </div>
          <div className="gazette-edition-row">
            <span className="gazette-edition-k">№</span>
            <span className="gazette-edition-v gazette-tabular">
              {String(totalEntries).padStart(3, "0")}
            </span>
          </div>
          <div className="gazette-edition-row gazette-edition-live">
            {liveCount > 0 ? (
              <>
                <span className="gazette-live-dot" />
                <span className="gazette-edition-k">On wire</span>
                <span className="gazette-edition-v gazette-tabular gazette-acid">
                  {liveCount}
                </span>
              </>
            ) : (
              <>
                <span className="gazette-edition-k">Wire</span>
                <span className="gazette-edition-v">quiet</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Thin rule + running slogan strip */}
      <div className="gazette-slogan-strip">
        <span className="gazette-slogan-item">Est. today</span>
        <span className="gazette-slogan-dot">◆</span>
        <span className="gazette-slogan-item">All matters fit to file</span>
        <span className="gazette-slogan-dot">◆</span>
        <span className="gazette-slogan-item">Cream &amp; ink · hand-set</span>
        <span className="gazette-slogan-dot">◆</span>
        <span className="gazette-slogan-item">
          <time dateTime={date.iso}>{date.iso}</time>
        </span>
        {rightSlot && <span className="gazette-slogan-right">{rightSlot}</span>}
      </div>

      <div className="gazette-rule-single" />
    </div>
  );
}
