import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ZoomIn, ZoomOut, RotateCcw, Bot, GitFork, ShieldCheck,
  ArrowRightLeft, Webhook, Layers, Trash2, Link2, X, ChevronDown, Puzzle,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { workflowsApi } from "../../api/workflows";
import { agentsApi } from "../../api/agents";
import { skillsApi } from "../../api/skills";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";
import type { WorkflowStep, WorkflowEdge } from "@paperclipai/shared";

// Step type config
const STEP_TYPES = [
  { type: "agent_run", label: "Agent Run", icon: Bot, color: "bg-indigo-500", desc: "Run an AI agent" },
  { type: "condition", label: "Condition", icon: GitFork, color: "bg-violet-500", desc: "Branch based on a condition" },
  { type: "parallel_gate", label: "Parallel Gate", icon: Layers, color: "bg-teal-500", desc: "Wait for parallel steps" },
  { type: "approval", label: "Approval", icon: ShieldCheck, color: "bg-amber-500", desc: "Require human approval" },
  { type: "transform", label: "Transform", icon: ArrowRightLeft, color: "bg-sky-500", desc: "Transform data between steps" },
  { type: "webhook", label: "Webhook", icon: Webhook, color: "bg-rose-500", desc: "Call an external URL" },
  { type: "sub_workflow", label: "Sub-Workflow", icon: Layers, color: "bg-purple-500", desc: "Run another workflow" },
] as const;

const CONDITION_OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "does not exist" },
];

interface Props {
  workflowId: string;
}

// Debounce helper for step updates
function useDebounced(fn: (...args: unknown[]) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback((...args: unknown[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function WorkflowBuilder({ workflowId }: Props) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId!;

  const { data: workflow } = useQuery({
    queryKey: queryKeys.workflows.detail(companyId, workflowId),
    queryFn: () => workflowsApi.get(companyId, workflowId),
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });

  const { data: skills } = useQuery({
    queryKey: queryKeys.skills.list(companyId),
    queryFn: () => skillsApi.list(companyId),
  });

  const { data: allWorkflows } = useQuery({
    queryKey: queryKeys.workflows.list(companyId),
    queryFn: () => workflowsApi.list(companyId),
  });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Local editable state for selected step (avoids mutation on every keystroke)
  const [localStepEdits, setLocalStepEdits] = useState<Record<string, unknown>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(companyId, workflowId) });
  };

  const addStepMutation = useMutation({
    mutationFn: (data: { name: string; stepType: string; position?: { x: number; y: number } }) =>
      workflowsApi.addStep(companyId, workflowId, data),
    onSuccess: (_res, vars) => {
      invalidate();
      pushToast({ title: `Added "${vars.name}" step`, tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to add step", body: (err as Error).message, tone: "error" });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ stepId, ...data }: { stepId: string } & Record<string, unknown>) =>
      workflowsApi.updateStep(companyId, workflowId, stepId, data),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast({ title: "Failed to save step", body: (err as Error).message, tone: "error" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => workflowsApi.deleteStep(companyId, workflowId, stepId),
    onSuccess: () => {
      setSelectedStepId(null);
      setLocalStepEdits({});
      invalidate();
      pushToast({ title: "Step deleted", tone: "info" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to delete step", body: (err as Error).message, tone: "error" });
    },
  });

  const addEdgeMutation = useMutation({
    mutationFn: (data: { sourceStepId: string; targetStepId: string; edgeType?: string }) =>
      workflowsApi.addEdge(companyId, workflowId, data),
    onSuccess: () => {
      invalidate();
      pushToast({ title: "Steps connected", tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to connect steps", body: (err as Error).message, tone: "error" });
    },
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: string) => workflowsApi.deleteEdge(companyId, workflowId, edgeId),
    onSuccess: () => {
      invalidate();
      pushToast({ title: "Connection removed", tone: "info" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to remove connection", body: (err as Error).message, tone: "error" });
    },
  });

  const layoutMutation = useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) =>
      workflowsApi.updateLayout(companyId, workflowId, positions),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast({ title: "Failed to save layout", body: (err as Error).message, tone: "error" });
    },
  });

  const steps = workflow?.steps ?? [];
  const edges = workflow?.edges ?? [];

  // Sync local edits when selecting a different step
  useEffect(() => {
    if (selectedStepId) {
      const step = steps.find(s => s.id === selectedStepId);
      if (step) {
        setLocalStepEdits({
          name: step.name,
          description: step.description ?? "",
          agentId: step.agentId ?? "",
          config: step.config ?? {},
        });
      }
    }
  }, [selectedStepId, workflow]);

  // Debounced save
  const debouncedSave = useDebounced((...args: unknown[]) => {
    const [stepId, data] = args as [string, Record<string, unknown>];
    updateStepMutation.mutate({ stepId, ...data });
  }, 600);

  const updateLocalAndSave = (field: string, value: unknown) => {
    const step = steps.find(s => s.id === selectedStepId);
    if (!step) return;
    const updated = { ...localStepEdits, [field]: value };
    setLocalStepEdits(updated);
    debouncedSave(step.id, { [field]: value });
  };

  const updateConfigAndSave = (configField: string, value: unknown) => {
    const step = steps.find(s => s.id === selectedStepId);
    if (!step) return;
    const currentConfig = (localStepEdits.config ?? step.config ?? {}) as Record<string, unknown>;
    const newConfig = { ...currentConfig, [configField]: value };
    setLocalStepEdits({ ...localStepEdits, config: newConfig });
    debouncedSave(step.id, { config: newConfig });
  };

  // Add step at a default position
  const handleAddStep = (type: string, label: string) => {
    const maxY = steps.reduce((max, s) => {
      const pos = (s.position ?? { x: 0, y: 0 }) as { x: number; y: number };
      return Math.max(max, pos.y);
    }, 0);
    addStepMutation.mutate({ name: label, stepType: type, position: { x: 200, y: maxY + 120 } });
    setShowAddMenu(false);
  };

  // Connect steps
  const handleStepClick = (stepId: string) => {
    if (connectingFrom) {
      if (connectingFrom !== stepId) {
        addEdgeMutation.mutate({ sourceStepId: connectingFrom, targetStepId: stepId });
      }
      setConnectingFrom(null);
    } else {
      setSelectedStepId(stepId);
      setAgentDropdownOpen(false);
    }
  };

  // Drag handling
  const handleDragStart = (stepId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = (steps.find(s => s.id === stepId)?.position ?? { x: 0, y: 0 }) as { x: number; y: number };
    setDragging(stepId);
    setDragStart({ x: e.clientX - pos.x * zoom, y: e.clientY - pos.y * zoom });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const newX = (e.clientX - dragStart.x) / zoom;
      const newY = (e.clientY - dragStart.y) / zoom;
      const step = steps.find(s => s.id === dragging);
      if (step) {
        (step.position as { x: number; y: number }).x = newX;
        (step.position as { x: number; y: number }).y = newY;
      }
    }
    if (isPanning.current) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
    }
  }, [dragging, dragStart, zoom, steps]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      const step = steps.find(s => s.id === dragging);
      if (step) {
        const pos = step.position as { x: number; y: number };
        layoutMutation.mutate({ [dragging]: pos });
      }
      setDragging(null);
    }
    isPanning.current = false;
  }, [dragging, steps, layoutMutation]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Canvas pan
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains("canvas-bg")) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      setSelectedStepId(null);
      setShowAddMenu(false);
    }
  };

  // Zoom with scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 4));
  }, []);

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

  // Get edges connected to a step
  const getStepEdges = (stepId: string) =>
    edges.filter(e => e.sourceStepId === stepId || e.targetStepId === stepId);

  const selectedStep = steps.find(s => s.id === selectedStepId);
  const selectedAgent = agents?.find(a => a.id === (localStepEdits.agentId || selectedStep?.agentId));

  // Helper to get agent name from id
  const agentName = (agentId: string | null) => {
    if (!agentId) return null;
    return agents?.find(a => a.id === agentId)?.name ?? agentId.slice(0, 8) + "...";
  };

  // Config getter from local edits
  const cfg = (localStepEdits.config ?? selectedStep?.config ?? {}) as Record<string, unknown>;

  return (
    <div className="relative h-[calc(100vh-200px)] min-h-[500px] overflow-hidden border border-border rounded-lg bg-muted/20">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-background border border-border rounded-md hover:bg-accent transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-background border border-border rounded-lg shadow-xl z-20 py-1">
              {STEP_TYPES.map(st => (
                <button
                  key={st.type}
                  onClick={() => handleAddStep(st.type, st.label)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
                >
                  <div className={cn("w-6 h-6 rounded flex items-center justify-center text-white shrink-0", st.color)}>
                    <st.icon className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="font-medium">{st.label}</div>
                    <div className="text-[10px] text-muted-foreground">{st.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-0.5 bg-background border border-border rounded-md shadow-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setZoom(z => Math.min(z * 1.2, 4))} className="p-1.5 hover:bg-accent rounded-l-md">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground self-center px-1 min-w-[3ch] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.2))} className="p-1.5 hover:bg-accent">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 hover:bg-accent rounded-r-md">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>
        </div>
        {connectingFrom && (
          <span className="flex items-center px-2 py-1 text-[11px] bg-indigo-500/10 text-indigo-600 rounded-md border border-indigo-300 shadow-sm">
            <Link2 className="h-3 w-3 mr-1" />
            Click target step...
            <button onClick={() => setConnectingFrom(null)} className="ml-1.5 hover:text-indigo-800">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 canvas-bg cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          {/* SVG edges */}
          <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none" style={{ overflow: "visible" }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
              </marker>
              <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
              </marker>
              <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
              </marker>
            </defs>
            {edges.map(edge => {
              const source = steps.find(s => s.id === edge.sourceStepId);
              const target = steps.find(s => s.id === edge.targetStepId);
              const sp = source ? getPos(source) : { x: 0, y: 0 };
              const tp = target ? getPos(target) : { x: 0, y: 0 };
              const midX = (sp.x + tp.x) / 2 + 100;
              const midY = (sp.y + tp.y) / 2 + 40;
              return (
                <g key={edge.id}>
                  <path
                    d={getEdgePath(edge)}
                    fill="none"
                    stroke={edgeColor(edge.edgeType)}
                    strokeWidth={2}
                    markerEnd={`url(#arrowhead${edge.edgeType === "condition_true" ? "-green" : edge.edgeType === "condition_false" ? "-red" : ""})`}
                  />
                  {/* Clickable hit area for edge deletion */}
                  <path
                    d={getEdgePath(edge)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer pointer-events-auto"
                    onClick={() => {
                      if (window.confirm("Delete this connection?")) {
                        deleteEdgeMutation.mutate(edge.id);
                      }
                    }}
                  />
                  {edge.label && (
                    <text x={midX} y={midY} fontSize="10" fill="#6b7280" textAnchor="middle">
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Step nodes */}
          {steps.map(step => {
            const pos = getPos(step);
            const stepType = STEP_TYPES.find(st => st.type === step.stepType);
            const Icon = stepType?.icon ?? Bot;
            const isSelected = step.id === selectedStepId;
            const agent = agentName(step.agentId);
            return (
              <div
                key={step.id}
                className={cn(
                  "absolute w-[200px] bg-background border-2 rounded-lg shadow-sm cursor-pointer transition-all hover:shadow-md select-none",
                  isSelected ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-md" : "border-border",
                  connectingFrom ? "hover:border-indigo-400 hover:ring-2 hover:ring-indigo-300/30" : "",
                )}
                style={{ left: pos.x, top: pos.y }}
                onClick={() => handleStepClick(step.id)}
                onMouseDown={(e) => handleDragStart(step.id, e)}
              >
                {!!(step.config as Record<string, unknown>)?.skillName && (
                  <div className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[9px] font-bold bg-purple-500 text-white rounded-full shadow-sm flex items-center gap-0.5 z-10">
                    <Puzzle className="h-2.5 w-2.5" />
                    {String((step.config as Record<string, unknown>).skillName)}
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0", stepType?.color ?? "bg-gray-500")}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{step.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {agent ? agent : step.stepType.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
                {/* Input connector (top) */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-background border-2 border-border" />
                {/* Output connector (bottom) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConnectingFrom(step.id); }}
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-border hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors z-10"
                    />
                  </TooltipTrigger>
                  <TooltipContent>Drag to connect to another step</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rich Step Configuration Panel */}
      {selectedStep && (
        <div className="absolute top-0 right-0 h-full w-80 bg-background border-l border-border shadow-lg overflow-y-auto z-20">
          <div className="p-4 space-y-4">
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => {
                  const st = STEP_TYPES.find(t => t.type === selectedStep.stepType);
                  const Icon = st?.icon ?? Bot;
                  return (
                    <div className={cn("w-6 h-6 rounded flex items-center justify-center text-white", st?.color ?? "bg-gray-500")}>
                      <Icon className="h-3 w-3" />
                    </div>
                  );
                })()}
                <h3 className="text-sm font-semibold">
                  {STEP_TYPES.find(t => t.type === selectedStep.stepType)?.label ?? "Step"}
                </h3>
              </div>
              <button
                onClick={() => { setSelectedStepId(null); setLocalStepEdits({}); }}
                className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Common fields */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                value={(localStepEdits.name as string) ?? selectedStep.name}
                onChange={(e) => updateLocalAndSave("name", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                rows={2}
                placeholder="What does this step do?"
                value={(localStepEdits.description as string) ?? selectedStep.description ?? ""}
                onChange={(e) => updateLocalAndSave("description", e.target.value)}
              />
            </div>

            <hr className="border-border" />

            {/* ===== AGENT RUN CONFIG ===== */}
            {selectedStep.stepType === "agent_run" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent</h4>

                {/* Agent picker */}
                <div className="relative">
                  <button
                    onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                    className="w-full flex items-center justify-between px-2.5 py-2 text-sm border border-border rounded-md bg-background hover:bg-accent/50 transition-colors"
                  >
                    {selectedAgent ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{selectedAgent.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{selectedAgent.role ?? selectedAgent.adapterType}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Select an agent...</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                  {agentDropdownOpen && agents && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-background border border-border rounded-md shadow-lg z-30">
                      {agents.filter(a => a.status !== "terminated").map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            updateLocalAndSave("agentId", agent.id);
                            updateStepMutation.mutate({ stepId: selectedStep.id, agentId: agent.id });
                            setAgentDropdownOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-2 w-full px-2.5 py-2 text-left hover:bg-accent transition-colors",
                            agent.id === (localStepEdits.agentId || selectedStep.agentId) ? "bg-accent/50" : "",
                          )}
                        >
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{agent.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{agent.role ?? agent.adapterType}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Prompt Template</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={4}
                    placeholder={"Use {{context}} for previous step outputs.\nE.g.: Analyze the following: {{prev.output}}"}
                    value={(cfg.promptTemplate as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("promptTemplate", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Timeout (sec)</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="300"
                      value={(cfg.timeoutSec as number) ?? ""}
                      onChange={(e) => updateConfigAndSave("timeoutSec", e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Max Retries</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="0"
                      value={((cfg.retryPolicy as Record<string, unknown>)?.maxRetries as number) ?? ""}
                      onChange={(e) => updateConfigAndSave("retryPolicy", {
                        ...((cfg.retryPolicy as Record<string, unknown>) ?? {}),
                        maxRetries: e.target.value ? Number(e.target.value) : 0,
                      })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Model Override</label>
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="Use agent default"
                    value={(cfg.model as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("model", e.target.value || undefined)}
                  />
                </div>

                <hr className="border-border" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Skill</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Skill</label>
                  <select
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    value={(cfg.skillName as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("skillName", e.target.value || undefined)}
                  >
                    <option value="">None</option>
                    {skills?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Injects skill instructions into the agent&apos;s prompt
                  </p>
                </div>
                {!!cfg.skillName && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!cfg.skillFiles}
                      onChange={(e) => updateConfigAndSave("skillFiles", e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Include skill&apos;s bundled files</span>
                  </label>
                )}
              </div>
            )}

            {/* ===== CONDITION CONFIG ===== */}
            {selectedStep.stepType === "condition" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condition</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Field (from context)</label>
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-sm font-mono border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. prev.output.status"
                    value={(cfg.field as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("field", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Operator</label>
                  <select
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    value={(cfg.operator as string) ?? "eq"}
                    onChange={(e) => updateConfigAndSave("operator", e.target.value)}
                  >
                    {CONDITION_OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Value</label>
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="Expected value"
                    value={String(cfg.value ?? "")}
                    onChange={(e) => updateConfigAndSave("value", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Expression (advanced)</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={2}
                    placeholder="JS expression, e.g.: context.score > 80"
                    value={(cfg.expression as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("expression", e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Connect &quot;true&quot; and &quot;false&quot; branches from the output connector.
                </p>
              </div>
            )}

            {/* ===== PARALLEL GATE CONFIG ===== */}
            {selectedStep.stepType === "parallel_gate" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parallel Gate</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Wait Strategy</label>
                  <div className="flex gap-2 mt-1">
                    {(["all", "any"] as const).map(strategy => (
                      <button
                        key={strategy}
                        onClick={() => updateConfigAndSave("waitFor", strategy)}
                        className={cn(
                          "flex-1 px-3 py-2 text-xs font-medium rounded-md border transition-colors",
                          (cfg.waitFor ?? "all") === strategy
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        Wait for {strategy}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(cfg.waitFor ?? "all") === "all"
                      ? "All incoming branches must complete before continuing."
                      : "Continue as soon as any incoming branch completes."}
                  </p>
                </div>
              </div>
            )}

            {/* ===== APPROVAL CONFIG ===== */}
            {selectedStep.stepType === "approval" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approval Gate</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Approval Message</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder="Describe what needs to be approved..."
                    value={(cfg.message as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("message", e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={(cfg.showContext as boolean) ?? true}
                    onChange={(e) => updateConfigAndSave("showContext", e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">Show workflow context to approver</span>
                </label>
              </div>
            )}

            {/* ===== TRANSFORM CONFIG ===== */}
            {selectedStep.stepType === "transform" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transform</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Template</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={4}
                    placeholder={'{"summary": "{{prev.output.text}}", "score": "{{prev.output.score}}"}'}
                    value={(cfg.template as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("template", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Field Mapping</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder={'key: "context.field"\notherKey: "prev.output.value"'}
                    value={cfg.mapping ? JSON.stringify(cfg.mapping, null, 2) : ""}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateConfigAndSave("mapping", parsed);
                      } catch {
                        // Allow typing invalid JSON while editing
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* ===== WEBHOOK CONFIG ===== */}
            {selectedStep.stepType === "webhook" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Webhook</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">URL</label>
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-sm font-mono border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="https://api.example.com/webhook"
                    value={(cfg.url as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("url", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Method</label>
                    <select
                      className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                      value={(cfg.method as string) ?? "POST"}
                      onChange={(e) => updateConfigAndSave("method", e.target.value)}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Timeout (ms)</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="30000"
                      value={(cfg.timeoutMs as number) ?? ""}
                      onChange={(e) => updateConfigAndSave("timeoutMs", e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Headers (JSON)</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={2}
                    placeholder={'{"Authorization": "Bearer {{env.TOKEN}}"}'}
                    value={cfg.headers ? JSON.stringify(cfg.headers, null, 2) : ""}
                    onChange={(e) => {
                      try {
                        updateConfigAndSave("headers", JSON.parse(e.target.value));
                      } catch { /* allow typing */ }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Body Template (JSON)</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder={'{"data": "{{prev.output}}"}'}
                    value={cfg.bodyTemplate ? JSON.stringify(cfg.bodyTemplate, null, 2) : ""}
                    onChange={(e) => {
                      try {
                        updateConfigAndSave("bodyTemplate", JSON.parse(e.target.value));
                      } catch { /* allow typing */ }
                    }}
                  />
                </div>
              </div>
            )}

            {/* ===== SUB-WORKFLOW CONFIG ===== */}
            {selectedStep.stepType === "sub_workflow" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sub-Workflow</h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Workflow</label>
                  <select
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none"
                    value={(cfg.workflowId as string) ?? ""}
                    onChange={(e) => updateConfigAndSave("workflowId", e.target.value)}
                  >
                    <option value="">Select a workflow...</option>
                    {allWorkflows?.filter(w => w.id !== workflowId).map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Input Mapping (JSON)</label>
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder={'{"input_field": "context.some_value"}'}
                    value={cfg.inputMapping ? JSON.stringify(cfg.inputMapping, null, 2) : ""}
                    onChange={(e) => {
                      try {
                        updateConfigAndSave("inputMapping", JSON.parse(e.target.value));
                      } catch { /* allow typing */ }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Connections section */}
            <hr className="border-border" />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connections</h4>
              {getStepEdges(selectedStep.id).length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No connections. Use the bottom connector dot to link steps.</p>
              ) : (
                <div className="space-y-1">
                  {getStepEdges(selectedStep.id).map(edge => {
                    const isSource = edge.sourceStepId === selectedStep.id;
                    const otherId = isSource ? edge.targetStepId : edge.sourceStepId;
                    const otherStep = steps.find(s => s.id === otherId);
                    return (
                      <div key={edge.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-muted/50">
                        <span className="text-muted-foreground">{isSource ? "To" : "From"}</span>
                        <span className="font-medium truncate flex-1">{otherStep?.name ?? "Unknown"}</span>
                        {edge.edgeType && edge.edgeType !== "default" && (
                          <span className="text-[10px] text-muted-foreground">{edge.edgeType}</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => deleteEdgeMutation.mutate(edge.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Remove connection</TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Delete step */}
            <hr className="border-border" />
            <button
              onClick={() => {
                if (window.confirm(`Delete step "${selectedStep.name}"?`)) {
                  deleteStepMutation.mutate(selectedStep.id);
                }
              }}
              className="w-full px-3 py-2 text-xs font-medium text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-3 w-3" />
              Delete Step
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Build your workflow</p>
              <p className="text-xs text-muted-foreground mt-1">Add steps and connect them to create a DAG pipeline.</p>
            </div>
            <button
              onClick={() => setShowAddMenu(true)}
              className="px-4 py-2 text-xs font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
            >
              Add First Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
