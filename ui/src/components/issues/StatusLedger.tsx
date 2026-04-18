/* ─────────────────────────────────────────────────────────────────────
 *  StatusLedger — horizontal "ticker" showing status distribution.
 *
 *  A full-width hairline-ruled strip that names each status, its count,
 *  and a proportional bar so the user eyeballs the mix at a glance.
 *  Reads like a financial-page bond-yield table: compact, monospaced,
 *  heavily ruled.
 *
 *  Clicking a cell calls `onFilterStatus` so the user can narrow the
 *  list below to just that status. This turns the header into a live
 *  filter — saving a click and giving the data ambient visibility.
 * ───────────────────────────────────────────────────────────────────── */

import type { Issue } from "@paperclipai/shared";

interface StatusLedgerProps {
  issues: Issue[];
  onFilterStatus?: (status: string) => void;
  activeStatus?: string | null;
}

const ORDER: Array<{ key: string; label: string; abbr: string }> = [
  { key: "in_progress", label: "In progress", abbr: "PROG" },
  { key: "todo", label: "To do", abbr: "TODO" },
  { key: "in_review", label: "In review", abbr: "REVW" },
  { key: "blocked", label: "Blocked", abbr: "BLKD" },
  { key: "backlog", label: "Backlog", abbr: "BKLG" },
  { key: "done", label: "Done", abbr: "DONE" },
];

export function StatusLedger({
  issues,
  onFilterStatus,
  activeStatus,
}: StatusLedgerProps) {
  const total = Math.max(1, issues.length);
  const counts = Object.fromEntries(
    ORDER.map(({ key }) => [key, issues.filter((i) => i.status === key).length]),
  ) as Record<string, number>;

  return (
    <section className="gazette-ledger" aria-label="Status ledger">
      <header className="gazette-ledger-head">
        <span className="gazette-ledger-head-l">Status register</span>
        <span className="gazette-ledger-head-r gazette-tabular">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </header>

      <div className="gazette-ledger-grid" role="list">
        {ORDER.map(({ key, label, abbr }) => {
          const n = counts[key] ?? 0;
          const pct = (n / total) * 100;
          const active = activeStatus === key;
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              className={`gazette-ledger-cell ${active ? "gazette-ledger-cell-active" : ""}`}
              onClick={() => onFilterStatus?.(key)}
              aria-pressed={active}
              aria-label={`${label}: ${n} of ${total}`}
            >
              <span className="gazette-ledger-abbr">{abbr}</span>
              <span className="gazette-ledger-count gazette-tabular">
                {String(n).padStart(2, "0")}
              </span>
              <span className="gazette-ledger-bar" aria-hidden="true">
                <span
                  className="gazette-ledger-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="gazette-ledger-label">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
