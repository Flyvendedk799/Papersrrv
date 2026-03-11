import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowsApi } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Workflow,
  Play,
  Pause,
  Plus,
  Trash2,
  Settings,
  LayoutList,
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { WorkflowStep, WorkflowEdge } from "@paperclipai/shared";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-muted/60 text-muted-foreground/60",
};

const runStatusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  awaiting_approval: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
};

function buildMermaidDiagram(steps: WorkflowStep[], edges: WorkflowEdge[]): string {
  if (steps.length === 0) return "graph TD\n  empty[No steps yet]";

  const lines: string[] = ["graph TD"];
  for (const step of steps) {
    const label = step.name.replace(/"/g, "'");
    lines.push(`  ${step.id}["${label}"]`);
  }
  for (const edge of edges) {
    const edgeLabel = edge.edgeType === "conditional" ? "-->|condition|" : "-->";
    lines.push(`  ${edge.sourceStepId} ${edgeLabel} ${edge.targetStepId}`);
  }
  return lines.join("\n");
}

export function WorkflowDetail() {
  const { workflowId, tab } = useParams<{ workflowId: string; tab?: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const activeTab = tab ?? "overview";

  // Step dialog state
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [newStepType, setNewStepType] = useState("agent_task");

  // Settings state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTriggerType, setEditTriggerType] = useState("");
  const [settingsDirty, setSettingsDirty] = useState(false);

  const {
    data: workflow,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.workflows.detail(selectedCompanyId!, workflowId!),
    queryFn: () => workflowsApi.get(selectedCompanyId!, workflowId!),
    enabled: !!selectedCompanyId && !!workflowId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.workflows.runs(selectedCompanyId!, workflowId!),
    queryFn: () => workflowsApi.listRuns(selectedCompanyId!, workflowId!),
    enabled: !!selectedCompanyId && !!workflowId && activeTab === "runs",
  });

  // Sync settings form when workflow loads
  useEffect(() => {
    if (workflow && !settingsDirty) {
      setEditName(workflow.name);
      setEditDescription(workflow.description ?? "");
      setEditTriggerType(workflow.triggerType ?? "manual");
    }
  }, [workflow, settingsDirty]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Workflows", href: "/workflows" },
      { label: workflow?.name ?? workflowId ?? "Workflow" },
    ]);
  }, [setBreadcrumbs, workflow, workflowId]);

  const updateWorkflow = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      workflowsApi.update(selectedCompanyId!, workflowId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(selectedCompanyId!, workflowId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.list(selectedCompanyId!),
      });
      setSettingsDirty(false);
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: () => workflowsApi.delete(selectedCompanyId!, workflowId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.list(selectedCompanyId!),
      });
      navigate("/workflows");
    },
  });

  const startRun = useMutation({
    mutationFn: () => workflowsApi.startRun(selectedCompanyId!, workflowId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.runs(selectedCompanyId!, workflowId!),
      });
    },
  });

  const addStep = useMutation({
    mutationFn: (data: { name: string; stepType: string }) =>
      workflowsApi.addStep(selectedCompanyId!, workflowId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(selectedCompanyId!, workflowId!),
      });
      setStepDialogOpen(false);
      setNewStepName("");
      setNewStepType("agent_task");
    },
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: string) =>
      workflowsApi.deleteStep(selectedCompanyId!, workflowId!, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(selectedCompanyId!, workflowId!),
      });
    },
  });

  const mermaidDiagram = useMemo(() => {
    if (!workflow) return "";
    return buildMermaidDiagram(workflow.steps ?? [], workflow.edges ?? []);
  }, [workflow]);

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!workflow) return null;

  const steps = workflow.steps ?? [];
  const edges = workflow.edges ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-muted-foreground" />
          <Badge variant="secondary" className={statusColors[workflow.status] ?? statusColors.draft}>
            {workflow.status}
          </Badge>
          {workflow.triggerType && (
            <Badge variant="outline" className="text-xs">
              {workflow.triggerType}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{workflow.name}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {workflow.status === "draft" && (
              <Button
                size="sm"
                onClick={() => updateWorkflow.mutate({ status: "active" })}
                disabled={updateWorkflow.isPending}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Activate
              </Button>
            )}
            {workflow.status === "active" && (
              <>
                <Button
                  size="sm"
                  onClick={() => startRun.mutate()}
                  disabled={startRun.isPending}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {startRun.isPending ? "Starting..." : "Start Run"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateWorkflow.mutate({ status: "paused" })}
                  disabled={updateWorkflow.isPending}
                >
                  <Pause className="h-3.5 w-3.5 mr-1.5" />
                  Pause
                </Button>
              </>
            )}
            {workflow.status === "paused" && (
              <Button
                size="sm"
                onClick={() => updateWorkflow.mutate({ status: "active" })}
                disabled={updateWorkflow.isPending}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Resume
              </Button>
            )}
          </div>
        </div>

        {workflow.description && (
          <p className="text-sm text-muted-foreground">{workflow.description}</p>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(`/workflows/${workflowId}/${value}`)}
      >
        <TabsList>
          <TabsTrigger value="overview">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="steps">
            <LayoutList className="h-3.5 w-3.5 mr-1.5" />
            Steps ({steps.length})
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Runs
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="border border-border p-4 space-y-3">
            <h3 className="text-sm font-medium">Workflow Diagram</h3>
            <pre className="bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
              {mermaidDiagram}
            </pre>
            <p className="text-xs text-muted-foreground">
              Mermaid diagram source. Paste into a Mermaid renderer to visualize.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium capitalize">{workflow.status}</p>
            </div>
            <div className="border border-border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Trigger</p>
              <p className="text-sm font-medium">{workflow.triggerType ?? "manual"}</p>
            </div>
            <div className="border border-border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Steps</p>
              <p className="text-sm font-medium">{steps.length}</p>
            </div>
            <div className="border border-border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Edges</p>
              <p className="text-sm font-medium">{edges.length}</p>
            </div>
          </div>
        </TabsContent>

        {/* Steps tab */}
        <TabsContent value="steps" className="mt-4 space-y-3">
          <div className="flex items-center justify-start">
            <Button size="sm" variant="outline" onClick={() => setStepDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Step
            </Button>
          </div>

          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet. Add a step to get started.</p>
          ) : (
            <div className="border border-border divide-y divide-border">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 p-3">
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{step.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">
                        {step.stepType}
                      </Badge>
                      {step.agentId && (
                        <span className="text-xs text-muted-foreground truncate">
                          Agent: {step.agentId.slice(0, 8)}...
                        </span>
                      )}
                      {step.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {step.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteStep.mutate(step.id)}
                    disabled={deleteStep.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Runs tab */}
        <TabsContent value="runs" className="mt-4 space-y-3">
          {!runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="border border-border divide-y divide-border">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center gap-3 p-3">
                  <span className="shrink-0">
                    {runStatusIcons[run.status] ?? runStatusIcons.pending}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        Run {run.id.slice(0, 8)}
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {run.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Started {new Date(run.createdAt).toLocaleString()}
                      {run.finishedAt && (
                        <> &middot; Completed {new Date(run.finishedAt).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="mt-4 space-y-6">
          <div className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  setSettingsDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                value={editDescription}
                onChange={(e) => {
                  setEditDescription(e.target.value);
                  setSettingsDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-trigger">Trigger Type</Label>
              <Input
                id="edit-trigger"
                value={editTriggerType}
                onChange={(e) => {
                  setEditTriggerType(e.target.value);
                  setSettingsDirty(true);
                }}
                placeholder="manual"
              />
            </div>
            <Button
              disabled={!settingsDirty || updateWorkflow.isPending}
              onClick={() =>
                updateWorkflow.mutate({
                  name: editName.trim(),
                  description: editDescription.trim(),
                  triggerType: editTriggerType.trim() || undefined,
                })
              }
            >
              {updateWorkflow.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <div className="border-t border-border pt-6 space-y-3">
            <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
            <div className="flex items-center gap-3">
              {workflow.status !== "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateWorkflow.mutate({ status: "archived" })}
                  disabled={updateWorkflow.isPending}
                >
                  Archive
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (window.confirm("Delete this workflow? This cannot be undone.")) {
                    deleteWorkflow.mutate();
                  }
                }}
                disabled={deleteWorkflow.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {deleteWorkflow.isPending ? "Deleting..." : "Delete Workflow"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Step Dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
            <DialogDescription>Add a new step to this workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="step-name">Step Name</Label>
              <Input
                id="step-name"
                placeholder="e.g. Analyze issue"
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-type">Step Type</Label>
              <Input
                id="step-type"
                placeholder="agent_task"
                value={newStepType}
                onChange={(e) => setNewStepType(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newStepName.trim() || addStep.isPending}
              onClick={() =>
                addStep.mutate({
                  name: newStepName.trim(),
                  stepType: newStepType.trim() || "agent_task",
                })
              }
            >
              {addStep.isPending ? "Adding..." : "Add Step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
