import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, Pause, SkipForward, Ban, ShieldAlert } from "lucide-react";
import { workflowsApi } from "../../api/workflows";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { cn } from "../../lib/utils";
import type { WorkflowStepRun, WorkflowStep } from "@paperclipai/shared";

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  queued: { icon: Clock, color: "text-yellow-500", label: "Queued" },
  running: { icon: Loader2, color: "text-indigo-500 animate-spin", label: "Running" },
  succeeded: { icon: CheckCircle2, color: "text-green-500", label: "Succeeded" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
  skipped: { icon: SkipForward, color: "text-muted-foreground", label: "Skipped" },
  waiting_approval: { icon: ShieldAlert, color: "text-amber-500", label: "Awaiting Approval" },
  cancelled: { icon: Ban, color: "text-muted-foreground", label: "Cancelled" },
};

interface Props {
  runId: string;
  onApprove?: (stepRunId: string) => void;
  onReject?: (stepRunId: string) => void;
}

export function WorkflowRunView({ runId, onApprove, onReject }: Props) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId!;

  const { data: run, isLoading } = useQuery({
    queryKey: queryKeys.workflows.run(companyId, runId),
    queryFn: () => workflowsApi.getRun(companyId, runId),
    refetchInterval: 3000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading run...</div>;
  if (!run) return <div className="text-sm text-muted-foreground py-4 text-center">Run not found</div>;

  const runStatus = statusConfig[run.status] ?? statusConfig.pending;
  const RunIcon = runStatus.icon;

  return (
    <div className="space-y-4">
      {/* Run header */}
      <div className="flex items-center gap-2">
        <RunIcon className={cn("h-5 w-5", runStatus.color)} />
        <span className="text-sm font-medium">Workflow Run</span>
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
          run.status === "succeeded" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
          run.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
          run.status === "running" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" :
          run.status === "paused" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
          "bg-muted text-muted-foreground"
        )}>
          {runStatus.label}
        </span>
        {run.startedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Started {new Date(run.startedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Step runs */}
      <div className="space-y-1">
        {run.stepRuns?.map((sr) => {
          const cfg = statusConfig[sr.status] ?? statusConfig.pending;
          const Icon = cfg.icon;
          return (
            <div key={sr.id} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors",
              sr.status === "running" ? "border-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20" :
              sr.status === "waiting_approval" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" :
              sr.status === "failed" ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" :
              "border-border"
            )}>
              <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{sr.step?.name ?? "Step"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {sr.step?.stepType.replace(/_/g, " ")}
                  {sr.error && <span className="text-red-500 ml-2">{sr.error}</span>}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{cfg.label}</span>
              {sr.status === "waiting_approval" && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onApprove?.(sr.id)}
                    className="px-2 py-1 text-[11px] font-medium bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onReject?.(sr.id)}
                    className="px-2 py-1 text-[11px] font-medium bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error display */}
      {run.error && (
        <div className="px-3 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200">
          {run.error}
        </div>
      )}
    </div>
  );
}
