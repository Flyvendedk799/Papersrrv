import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, Loader2, SkipForward, Ban,
  ShieldAlert, Bot, GitFork, ShieldCheck, ArrowRightLeft, Webhook, Layers, Puzzle,
} from "lucide-react";
import { workflowsApi } from "../../api/workflows";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { cn } from "../../lib/utils";
import type { WorkflowStep, WorkflowEdge } from "@paperclipai/shared";

const STATUS_STYLES: Record<string, { border: string; bg: string; icon: typeof CheckCircle2; animate?: string }> = {
  pending: { border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50 dark:bg-blue-950/20", icon: Clock },
  queued: { border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50 dark:bg-blue-950/20", icon: Clock },
  running: { border: "border-indigo-400 dark:border-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/20", icon: Loader2, animate: "animate-pulse" },
  succeeded: { border: "border-green-400 dark:border-green-600", bg: "bg-green-50 dark:bg-green-950/20", icon: CheckCircle2 },
  failed: { border: "border-red-400 dark:border-red-600", bg: "bg-red-50 dark:bg-red-950/20", icon: XCircle },
  skipped: { border: "border-gray-300 dark:border-gray-700", bg: "bg-gray-50/50 dark:bg-gray-950/20", icon: SkipForward },
  waiting_approval: { border: "border-amber-400 dark:border-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20", icon: ShieldAlert },
  cancelled: { border: "border-gray-300 dark:border-gray-700", bg: "bg-gray-50/50 dark:bg-gray-950/20", icon: Ban },
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
  workflowId: string;
  runId: string;
}

export function WorkflowRunDag({ workflowId, runId }: Props) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId!;

  const { data: workflow } = useQuery({
    queryKey: queryKeys.workflows.detail(companyId, workflowId),
    queryFn: () => workflowsApi.get(companyId, workflowId),
  });

  const { data: run } = useQuery({
    queryKey: queryKeys.workflows.run(companyId, runId),
    queryFn: () => workflowsApi.getRun(companyId, runId),
    refetchInterval: 3000,
  });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains("dag-bg")) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 3));
  }, []);

  const steps = workflow?.steps ?? [];
  const edges = workflow?.edges ?? [];
  const stepRuns = run?.stepRuns ?? [];

  const stepRunMap = new Map(stepRuns.map(sr => [sr.stepId, sr]));

  const getPos = (step: WorkflowStep) => {
    const p = (step.position ?? { x: 0, y: 0 }) as { x: number; y: number };
    return { x: p.x, y: p.y };
  };

  const getEdgePath = (edge: WorkflowEdge) => {
    const source = steps.find(s => s.id === edge.sourceStepId);
    const target = steps.find(s => s.id === edge.targetStepId);
    if (!source || !target) return "";
    const sp = getPos(source);
    const tp = getPos(target);
    const sx = sp.x + 100;
    const sy = sp.y + 40;
    const tx = tp.x + 100;
    const ty = tp.y;
    const midY = (sy + ty) / 2;
    return `M ${sx} ${sy + 40} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
  };

  const edgeColor = (type: string) => {
    if (type === "condition_true") return "#22c55e";
    if (type === "condition_false") return "#ef4444";
    return "#94a3b8";
  };

  if (!workflow || !run) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading DAG...</div>;
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[400px] overflow-hidden border border-border rounded-lg bg-muted/20 cursor-grab active:cursor-grabbing dag-bg"
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none" style={{ overflow: "visible" }}>
          <defs>
            <marker id="dag-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
            <marker id="dag-arrow-green" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
            </marker>
            <marker id="dag-arrow-red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
          </defs>
          {edges.map(edge => (
            <path
              key={edge.id}
              d={getEdgePath(edge)}
              fill="none"
              stroke={edgeColor(edge.edgeType)}
              strokeWidth={2}
              markerEnd={`url(#dag-arrow${edge.edgeType === "condition_true" ? "-green" : edge.edgeType === "condition_false" ? "-red" : ""})`}
            />
          ))}
        </svg>

        {/* Step nodes */}
        {steps.map(step => {
          const pos = getPos(step);
          const sr = stepRunMap.get(step.id);
          const status = sr?.status ?? "pending";
          const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
          const StatusIcon = style.icon;
          const StepIcon = STEP_TYPE_ICONS[step.stepType] ?? Bot;
          const stepColor = STEP_TYPE_COLORS[step.stepType] ?? "bg-gray-500";
          const skillName = (step.config as Record<string, unknown>)?.skillName;

          return (
            <div
              key={step.id}
              className={cn(
                "absolute w-[200px] border-2 rounded-lg shadow-sm select-none transition-all",
                style.border,
                style.bg,
                style.animate,
                status === "skipped" && "opacity-50",
              )}
              style={{ left: pos.x, top: pos.y }}
            >
              {!!skillName && (
                <div className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[9px] font-bold bg-purple-500 text-white rounded-full shadow-sm flex items-center gap-0.5 z-10">
                  <Puzzle className="h-2.5 w-2.5" />
                  {String(skillName)}
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0", stepColor)}>
                  <StepIcon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{step.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {step.stepType.replace(/_/g, " ")}
                  </div>
                </div>
                <StatusIcon className={cn(
                  "h-4 w-4 shrink-0",
                  status === "succeeded" && "text-green-500",
                  status === "failed" && "text-red-500",
                  status === "running" && "text-indigo-500 animate-spin",
                  status === "waiting_approval" && "text-amber-500",
                  (status === "pending" || status === "queued") && "text-blue-400",
                  (status === "skipped" || status === "cancelled") && "text-gray-400",
                )} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex gap-1 bg-background border border-border rounded-md shadow-sm text-xs">
        <button onClick={() => setZoom(z => Math.min(z * 1.2, 3))} className="px-2 py-1 hover:bg-accent rounded-l-md">+</button>
        <span className="px-1 py-1 text-muted-foreground min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.3))} className="px-2 py-1 hover:bg-accent rounded-r-md">-</button>
      </div>
    </div>
  );
}
