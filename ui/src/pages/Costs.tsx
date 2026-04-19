import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatTokens, cn } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/boared/PageHeader";
import { SectionRule } from "../components/boared/Kicker";
import { Clipping } from "../components/boared/Clipping";
import { DollarSign } from "lucide-react";

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  mtd: "Month to date",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  ytd: "Year to date",
  all: "All time",
  custom: "Custom",
};

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
      return { from: "", to: "" };
    case "custom":
      return { from: "", to: "" };
  }
}

export function Costs() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Costs" }]);
  }, [setBreadcrumbs]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : "",
        to: customTo ? new Date(customTo + "T23:59:59.999Z").toISOString() : "",
      };
    }
    return computeRange(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject };
    },
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select a company to view costs." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="costs" />;
  }

  const presetKeys: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§12 · Ledger</>}
        title={<>The <em className="not-italic font-normal">ledger</em>.</>}
        dateline={todayDateline()}
        actions={
          <div className="flex flex-wrap items-center gap-0 border border-foreground">
            {presetKeys.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={cn(
                  "inline-flex items-center px-3 h-9 border-r border-[var(--boared-rule)] last:border-r-0",
                  "font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors",
                  preset === p
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-foreground/[0.05]"
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        }
      />

      {preset === "custom" && (
        <div className="mb-6 flex items-center gap-3 font-mono text-[0.72rem]">
          <span className="boared-label">From</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 border border-foreground bg-background px-2 text-[0.72rem] text-foreground font-mono"
          />
          <span className="boared-label">To</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 border border-foreground bg-background px-2 text-[0.72rem] text-foreground font-mono"
          />
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {data && (
        <>
          <SectionRule label="Summary" meta={PRESET_LABELS[preset]} />
          <Clipping
            kicker={<>{PRESET_LABELS[preset]}</>}
            title={
              <>
                {formatCents(data.summary.spendCents)}{" "}
                <span className="font-mono text-[0.82rem] text-muted-foreground normal-case tracking-normal">
                  {data.summary.budgetCents > 0
                    ? `of ${formatCents(data.summary.budgetCents)}`
                    : "unlimited budget"}
                </span>
              </>
            }
            meta={
              data.summary.budgetCents > 0
                ? `${data.summary.utilizationPercent}% utilized`
                : undefined
            }
          >
            {data.summary.budgetCents > 0 && (
              <div className="w-full h-3 border border-foreground bg-[var(--boared-paper-2)]">
                <div
                  className="h-full bg-foreground transition-[width] duration-150"
                  style={{ width: `${Math.min(100, data.summary.utilizationPercent)}%` }}
                />
              </div>
            )}
          </Clipping>

          <SectionRule label="By agent" />
          <Clipping variant="inset">
            {data.byAgent.length === 0 ? (
              <p className="font-mono text-[0.72rem] text-muted-foreground py-2">
                No cost events yet.
              </p>
            ) : (
              <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                {data.byAgent.map((row) => (
                  <div
                    key={row.agentId}
                    className="flex items-start justify-between gap-4 py-3 text-[0.82rem]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Identity name={row.agentName ?? row.agentId} size="sm" />
                      {row.agentStatus === "terminated" && (
                        <StatusBadge status="terminated" />
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono tabular-nums block">{formatCents(row.costCents)}</span>
                      <span className="font-mono text-[0.62rem] text-muted-foreground block">
                        in {formatTokens(row.inputTokens)} / out {formatTokens(row.outputTokens)} tok
                      </span>
                      {(row.apiRunCount > 0 || row.subscriptionRunCount > 0) && (
                        <span className="font-mono text-[0.62rem] text-muted-foreground block">
                          {row.apiRunCount > 0 ? `api runs: ${row.apiRunCount}` : null}
                          {row.apiRunCount > 0 && row.subscriptionRunCount > 0 ? " | " : null}
                          {row.subscriptionRunCount > 0
                            ? `subscription runs: ${row.subscriptionRunCount} (${formatTokens(row.subscriptionInputTokens)} in / ${formatTokens(row.subscriptionOutputTokens)} out tok)`
                            : null}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Clipping>

          <SectionRule label="By project" />
          <Clipping variant="inset">
            {data.byProject.length === 0 ? (
              <p className="font-mono text-[0.72rem] text-muted-foreground py-2">
                No project-attributed run costs yet.
              </p>
            ) : (
              <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                {data.byProject.map((row) => (
                  <div
                    key={row.projectId ?? "na"}
                    className="flex items-center justify-between gap-4 py-3 text-[0.82rem]"
                  >
                    <span className="truncate">
                      {row.projectName ?? row.projectId ?? "Unattributed"}
                    </span>
                    <span className="font-mono tabular-nums">{formatCents(row.costCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </Clipping>
        </>
      )}
    </div>
  );
}
