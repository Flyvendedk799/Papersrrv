import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ZoomIn, ZoomOut, RotateCcw, Play, Bot, GitFork, ShieldCheck, ArrowRightLeft, Webhook, Layers } from "lucide-react";
import { workflowsApi } from "../../api/workflows";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { cn } from "../../lib/utils";
import type { WorkflowStep, WorkflowEdge } from "@paperclipai/shared";

// Step type config
const STEP_TYPES = [
  { type: "agent_run", label: "Agent Run", icon: Bot, color: "bg-indigo-500" },
  { type: "condition", label: "Condition", icon: GitFork, color: "bg-violet-500" },
  { type: "parallel_gate", label: "Parallel Gate", icon: Layers, color: "bg-teal-500" },
  { type: "approval", label: "Approval", icon: ShieldCheck, color: "bg-amber-500" },
  { type: "transform", label: "Transform", icon: ArrowRightLeft, color: "bg-sky-500" },
  { type: "webhook", label: "Webhook", icon: Webhook, color: "bg-rose-500" },
  { type: "sub_workflow", label: "Sub-Workflow", icon: Layers, color: "bg-purple-500" },
] as const;

interface Props {
  workflowId: string;
}

export function WorkflowBuilder({ workflowId }: Props) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;

  const { data: workflow } = useQuery({
    queryKey: queryKeys.workflows.detail(companyId, workflowId),
    queryFn: () => workflowsApi.get(companyId, workflowId),
  });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(companyId, workflowId) });
  };

  const addStepMutation = useMutation({
    mutationFn: (data: { name: string; stepType: string; position?: { x: number; y: number } }) =>
      workflowsApi.addStep(companyId, workflowId, data),
    onSuccess: invalidate,
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ stepId, ...data }: { stepId: string } & Record<string, unknown>) =>
      workflowsApi.updateStep(companyId, workflowId, stepId, data),
    onSuccess: invalidate,
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => workflowsApi.deleteStep(companyId, workflowId, stepId),
    onSuccess: () => { setSelectedStepId(null); invalidate(); },
  });

  const addEdgeMutation = useMutation({
    mutationFn: (data: { sourceStepId: string; targetStepId: string }) =>
      workflowsApi.addEdge(companyId, workflowId, data),
    onSuccess: invalidate,
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: string) => workflowsApi.deleteEdge(companyId, workflowId, edgeId),
    onSuccess: invalidate,
  });

  const layoutMutation = useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) =>
      workflowsApi.updateLayout(companyId, workflowId, positions),
    onSuccess: invalidate,
  });

  const steps = workflow?.steps ?? [];
  const edges = workflow?.edges ?? [];

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
      // Optimistic local update would be better, but for simplicity:
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
    }
  };

  // Get step position
  const getPos = (step: WorkflowStep) => {
    const p = (step.position ?? { x: 0, y: 0 }) as { x: number; y: number };
    return { x: p.x, y: p.y };
  };

  // Edge path
  const getEdgePath = (edge: WorkflowEdge) => {
    const source = steps.find(s => s.id === edge.sourceStepId);
    const target = steps.find(s => s.id === edge.targetStepId);
    if (!source || !target) return "";
    const sp = getPos(source);
    const tp = getPos(target);
    const sx = sp.x + 100; // center of node (200px wide)
    const sy = sp.y + 40; // bottom of node (80px tall)
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

  const selectedStep = steps.find(s => s.id === selectedStepId);

  return (
    <div className="relative h-[calc(100vh-240px)] min-h-[400px] overflow-hidden border border-border rounded-lg bg-muted/20">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-background border border-border rounded-md hover:bg-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-background border border-border rounded-md shadow-lg z-20">
              {STEP_TYPES.map(st => (
                <button
                  key={st.type}
                  onClick={() => handleAddStep(st.type, st.label)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
                >
                  <st.icon className="h-3.5 w-3.5" />
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setZoom(z => Math.min(z * 1.2, 3))} className="p-1.5 bg-background border border-border rounded-md hover:bg-accent" title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.3))} className="p-1.5 bg-background border border-border rounded-md hover:bg-accent" title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 bg-background border border-border rounded-md hover:bg-accent" title="Reset">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        {connectingFrom && (
          <span className="flex items-center px-2 py-1 text-[11px] bg-indigo-500/10 text-indigo-600 rounded-md border border-indigo-300">
            Click target step to connect...
            <button onClick={() => setConnectingFrom(null)} className="ml-1 hover:text-indigo-800">&times;</button>
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 canvas-bg cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
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
            {edges.map(edge => (
              <g key={edge.id}>
                <path
                  d={getEdgePath(edge)}
                  fill="none"
                  stroke={edgeColor(edge.edgeType)}
                  strokeWidth={2}
                  markerEnd={`url(#arrowhead${edge.edgeType === "condition_true" ? "-green" : edge.edgeType === "condition_false" ? "-red" : ""})`}
                />
                {edge.label && (() => {
                  const source = steps.find(s => s.id === edge.sourceStepId);
                  const target = steps.find(s => s.id === edge.targetStepId);
                  if (!source || !target) return null;
                  const sp = getPos(source);
                  const tp = getPos(target);
                  return (
                    <text x={(sp.x + tp.x) / 2 + 100} y={(sp.y + tp.y) / 2 + 20} fontSize="10" fill="#6b7280" textAnchor="middle">
                      {edge.label}
                    </text>
                  );
                })()}
              </g>
            ))}
          </svg>

          {/* Step nodes */}
          {steps.map(step => {
            const pos = getPos(step);
            const stepType = STEP_TYPES.find(st => st.type === step.stepType);
            const Icon = stepType?.icon ?? Bot;
            const isSelected = step.id === selectedStepId;
            return (
              <div
                key={step.id}
                className={cn(
                  "absolute w-[200px] bg-background border-2 rounded-lg shadow-sm cursor-pointer transition-shadow hover:shadow-md select-none",
                  isSelected ? "border-indigo-500 ring-2 ring-indigo-300" : "border-border",
                )}
                style={{ left: pos.x, top: pos.y }}
                onClick={() => handleStepClick(step.id)}
                onMouseDown={(e) => handleDragStart(step.id, e)}
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0", stepType?.color ?? "bg-gray-500")}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{step.name}</div>
                    <div className="text-[10px] text-muted-foreground">{step.stepType.replace(/_/g, " ")}</div>
                  </div>
                </div>
                {/* Output connector */}
                <button
                  onClick={(e) => { e.stopPropagation(); setConnectingFrom(step.id); }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-border hover:border-indigo-500 hover:bg-indigo-50 transition-colors z-10"
                  title="Drag to connect"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Step config panel */}
      {selectedStep && (
        <div className="absolute top-0 right-0 h-full w-72 bg-background border-l border-border shadow-lg overflow-y-auto z-20">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Step Config</h3>
              <button onClick={() => setSelectedStepId(null)} className="text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                  value={selectedStep.name}
                  onChange={(e) => updateStepMutation.mutate({ stepId: selectedStep.id, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <div className="text-sm mt-1 px-2 py-1.5 border border-border rounded-md bg-muted/30">
                  {selectedStep.stepType.replace(/_/g, " ")}
                </div>
              </div>
              {selectedStep.stepType === "agent_run" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Agent ID</label>
                  <input
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background font-mono text-xs"
                    value={selectedStep.agentId ?? ""}
                    placeholder="Select agent..."
                    onChange={(e) => updateStepMutation.mutate({ stepId: selectedStep.id, agentId: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background resize-none"
                  rows={3}
                  value={selectedStep.description ?? ""}
                  onChange={(e) => updateStepMutation.mutate({ stepId: selectedStep.id, description: e.target.value })}
                />
              </div>
              <button
                onClick={() => deleteStepMutation.mutate(selectedStep.id)}
                className="w-full mt-2 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors"
              >
                Delete Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto">
            <p className="text-sm text-muted-foreground mb-2">No steps yet. Add your first step to begin.</p>
            <button
              onClick={() => setShowAddMenu(true)}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 inline mr-1" /> Add Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
