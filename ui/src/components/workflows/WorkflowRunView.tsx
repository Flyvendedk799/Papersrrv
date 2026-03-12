import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, Loader2, SkipForward, Ban,
  ShieldAlert, ChevronDown, ChevronRight, Bot, GitFork, ShieldCheck,
  ArrowRightLeft, Webhook, Layers, ArrowDown,
} from "lucide-react";
import { workflowsApi } from "../../api/workflows";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { cn } from "../../lib/utils";
import { WorkflowRunDag } from "./WorkflowRunDag";
import { WorkflowOutputs } from "./WorkflowOutputs";
import type { WorkflowStepRun, WorkflowStep } from "@paperclipai/shared";

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string; bg: string; border: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending", bg: "bg-muted/30", border: "border-border" },
  queued: { icon: Clock, color: "text-yellow-500", label: "Queued", bg: "bg-yellow-50/50 dark:bg-yellow-950/10", border: "border-yellow-200 dark:border-yellow-800" },
  running: { icon: Loader2, color: "text-indigo-500 animate-spin", label: "Running", bg: "bg-indigo-50/50 dark:bg-indigo-950/20", border: "border-indigo-300 dark:border-indigo-700" },
  succeeded: { icon: CheckCircle2, color: "text-green-500", label: "Succeeded", bg: "bg-green-50/50 dark:bg-green-950/10", border: "border-green-200 dark:border-green-800" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed", bg: "bg-red-50/50 dark:bg-red-950/10", border: "border-red-200 dark:border-red-800" },
  skipped: { icon: SkipForward, color: "text-muted-foreground", label: "Skipped", bg: "bg-muted/20", border: "border-border" },
  waiting_approval: { icon: ShieldAlert, color: "text-amber-500", label: "Awaiting Approval", bg: "bg-amber-50/50 dark:bg-amber-950/20", border: "border-amber-300 dark:border-amber-700" },
  cancelled: { icon: Ban, color: "text-muted-foreground", label: "Cancelled", bg: "bg-muted/20", border: "border-border" },
};

const STEP_TYPE_ICONS: Record<string, typeof Bot> = {
  agent_run: Bot,
  condition: GitFork,
  parallel_gate: Layers,
  approval: ShieldCheck,
  transform: ArrowRightLeft,
  webhook: Webhook,
  sub_workflow: Layers,
};

const STEP_TYPE_COLORS: Record<string, string> = {
  agent_run: "bg-indigo-500",
  condition: "bg-violet-500",
  parallel_gate: "bg-teal-500",
  approval: "bg-amber-500",
  transform: "bg-sky-500",
  webhook: "bg-rose-500",
  sub_workflow: "bg-purple-500",
};

interface Props {
  runId: string;
  onApprove?: (stepRunId: string) => void;
  onReject?: (stepRunId: string) => void;
}

export function WorkflowRunView({ runId, onApprove, onReject }: Props) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId!;
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"pipeline" | "dag">("pipeline");

  const { data: run, isLoading } = useQuery({
    queryKey: queryKeys.workflows.run(companyId, runId),
    queryFn: () => workflowsApi.getRun(companyId, runId),
    refetchInterval: 3000,
  });

  const toggleStep = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading run...</div>;
  if (!run) return <div className="text-sm text-muted-foreground py-4 text-center">Run not found</div>;

  const runStatus = statusConfig[run.status] ?? statusConfig.pending;
  const RunIcon = runStatus.icon;
  const stepRuns = run.stepRuns ?? [];

  // Calculate elapsed time
  const elapsed = run.startedAt
    ? run.finishedAt
      ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
      : Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)
    : null;

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  // Progress stats
  const completed = stepRuns.filter(sr => sr.status === "succeeded").length;
  const total = stepRuns.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Run header */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RunIcon className={cn("h-5 w-5", runStatus.color)} />
            <span className="text-sm font-semibold">{runStatus.label}</span>
            {run.startedAt && (
              <span className="text-xs text-muted-foreground">
                Started {new Date(run.startedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {elapsed != null && (
              <span>{formatDuration(elapsed)}</span>
            )}
            <span>{completed}/{total} steps</span>
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                run.status === "failed" ? "bg-red-500" :
                run.status === "succeeded" ? "bg-green-500" :
                "bg-indigo-500",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 text-xs">
        <button
          onClick={() => setViewMode("pipeline")}
          className={cn(
            "px-2.5 py-1 rounded-md transition-colors",
            viewMode === "pipeline" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          Pipeline
        </button>
        <button
          onClick={() => setViewMode("dag")}
          className={cn(
            "px-2.5 py-1 rounded-md transition-colors",
            viewMode === "dag" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          DAG
        </button>
      </div>

      {viewMode === "dag" ? (
        <WorkflowRunDag workflowId={run.workflowId} runId={runId} />
      ) : (
      <>
      {/* Step runs as visual pipeline */}
      <div className="space-y-0">
        {stepRuns.map((sr, idx) => {
          const cfg = statusConfig[sr.status] ?? statusConfig.pending;
          const Icon = cfg.icon;
          const StepIcon = STEP_TYPE_ICONS[sr.step?.stepType ?? ""] ?? Bot;
          const stepColor = STEP_TYPE_COLORS[sr.step?.stepType ?? ""] ?? "bg-gray-500";
          const isExpanded = expandedSteps.has(sr.id);
          const hasOutput = sr.output && Object.keys(sr.output).length > 0;
          const hasError = !!sr.error;

          return (
            <div key={sr.id}>
              {/* Connector line */}
              {idx > 0 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              )}

              <div className={cn(
                "rounded-lg border transition-colors",
                cfg.border,
                cfg.bg,
              )}>
                {/* Step header */}
                <button
                  onClick={() => toggleStep(sr.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left"
                >
                  <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0", stepColor)}>
                    <StepIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{sr.step?.name ?? "Step"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {sr.step?.stepType?.replace(/_/g, " ")}
                      </span>
                    </div>
                    {sr.startedAt && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {sr.finishedAt
                          ? `Completed in ${formatDuration(Math.round((new Date(sr.finishedAt).getTime() - new Date(sr.startedAt).getTime()) / 1000))}`
                          : `Running for ${formatDuration(Math.round((Date.now() - new Date(sr.startedAt).getTime()) / 1000))}`
                        }
                        {sr.retryCount > 0 && ` (retry ${sr.retryCount})`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <Icon className={cn("h-4 w-4", cfg.color)} />
                      <span className="text-xs font-medium">{cfg.label}</span>
                    </div>
                    {(hasOutput || hasError) && (
                      isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Approval actions */}
                {sr.status === "waiting_approval" && (
                  <div className="flex gap-2 px-4 pb-3">
                    <button
                      onClick={() => onApprove?.(sr.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onReject?.(sr.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (hasOutput || hasError) && (
                  <div className="border-t border-border/50 px-4 py-3 space-y-2">
                    {hasError && (
                      <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md p-2 font-mono">
                        {sr.error}
                      </div>
                    )}
                    {hasOutput && (
                      <div>
                        <div className="text-[10px] text-muted-foreground font-medium mb-1">Output</div>
                        <pre className="text-[11px] font-mono bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap max-h-40">
                          {JSON.stringify(sr.output, null, 2)}
                        </pre>
                      </div>
                    )}
                    {sr.input && Object.keys(sr.input).length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted-foreground font-medium mb-1">Input</div>
                        <pre className="text-[11px] font-mono bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap max-h-40">
                          {JSON.stringify(sr.input, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run error */}
      {run.error && (
        <div className="px-3 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200 dark:border-red-800">
          <span className="font-medium">Error: </span>{run.error}
        </div>
      )}
      </>
      )}

      {/* Workflow outputs */}
      {run.status === "succeeded" && stepRuns.length > 0 && (
        <div className="border-t border-border mt-4 pt-4">
          <h3 className="text-sm font-medium mb-3">Workflow Outputs</h3>
          <WorkflowOutputs stepRuns={stepRuns} />
        </div>
      )}
    </div>
  );
}
