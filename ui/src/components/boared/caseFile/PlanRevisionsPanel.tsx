/**
 * PlanRevisionsPanel (F7) — versioned history of a plan's
 * plan_output_json. Renders a chronological list; each entry shows
 * version, author, timestamp and a short "summary of change".
 * A full diff viewer is out of scope for the initial land; the raw
 * JSON for each revision is available via expand.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { backlogApi } from "../../../api/backlog";
import { cn, relativeTime } from "../../../lib/utils";

export function PlanRevisionsPanel({
  planId,
  companyId,
}: {
  planId: string;
  companyId: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: revisions, isLoading } = useQuery({
    queryKey: ["backlog", "plan", planId, "revisions"],
    queryFn: () => backlogApi.listPlanRevisions(companyId, planId),
  });
  const rows = revisions ?? [];

  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        Revisions · {rows.length}
      </h2>
      {isLoading ? (
        <p className="font-mono text-[0.7rem] text-[var(--boared-ink-faint)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="font-serif italic text-[0.9rem] text-[var(--boared-ink-faint)]">
          No revisions yet.
        </p>
      ) : (
        <ul className="border border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--boared-paper-2)]/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif italic text-[0.92rem] text-[var(--boared-ink)] truncate">
                      v{r.version} · {r.summaryOfChange ?? "(no summary)"}
                    </div>
                    <div className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-0.5">
                      {relativeTime(r.editedAt)}
                      {r.editedByUserId && <> · by user {r.editedByUserId.slice(0, 6)}</>}
                      {r.editedByAgentId && <> · by agent {r.editedByAgentId.slice(0, 6)}</>}
                    </div>
                  </div>
                  <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
                    {isOpen ? "hide" : "show"}
                  </span>
                </button>
                {isOpen && (
                  <pre className="font-mono text-[0.7rem] p-3 bg-[var(--boared-paper-2)]/40 overflow-auto border-t border-[var(--boared-rule)] whitespace-pre-wrap break-words">
                    {JSON.stringify(r.planOutputJson, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
