import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowsApi } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { WorkflowBuilder } from "../components/workflows/WorkflowBuilder";
import { WorkflowRunView } from "../components/workflows/WorkflowRunView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Workflow,
  Play,
  Pause,
  Trash2,
  Settings,
  Activity,
  Boxes,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Eye,
} from "lucide-react";

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

export function WorkflowDetail() {
  const { workflowId, tab } = useParams<{ workflowId: string; tab?: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const activeTab = tab ?? "builder";

  // Settings state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTriggerType, setEditTriggerType] = useState("");
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Run detail state
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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
    enabled: !!selectedCompanyId && !!workflowId && (activeTab === "runs" || activeTab === "builder"),
    refetchInterval: activeTab === "runs" ? 5000 : false,
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
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(selectedCompanyId!, workflowId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.list(selectedCompanyId!),
      });
      setSettingsDirty(false);
      const status = vars.status as string | undefined;
      if (status === "active") pushToast({ title: "Workflow activated", tone: "success" });
      else if (status === "paused") pushToast({ title: "Workflow paused", tone: "info" });
      else if (status === "archived") pushToast({ title: "Workflow archived", tone: "info" });
      else pushToast({ title: "Settings saved", tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to update workflow", body: (err as Error).message, tone: "error" });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: () => workflowsApi.delete(selectedCompanyId!, workflowId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.list(selectedCompanyId!),
      });
      pushToast({ title: "Workflow deleted", tone: "success" });
      navigate("/workflows");
    },
    onError: (err) => {
      pushToast({ title: "Failed to delete workflow", body: (err as Error).message, tone: "error" });
    },
  });

  const startRun = useMutation({
    mutationFn: () => workflowsApi.startRun(selectedCompanyId!, workflowId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.runs(selectedCompanyId!, workflowId!),
      });
      pushToast({ title: "Run started", body: "The workflow is now executing.", tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to start run", body: (err as Error).message, tone: "error" });
    },
  });

  const approveStep = useMutation({
    mutationFn: ({ runId, stepRunId }: { runId: string; stepRunId: string }) =>
      workflowsApi.approveStep(selectedCompanyId!, runId, stepRunId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.runs(selectedCompanyId!, workflowId!),
      });
      pushToast({ title: "Step approved", tone: "success" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to approve step", body: (err as Error).message, tone: "error" });
    },
  });

  const rejectStep = useMutation({
    mutationFn: ({ runId, stepRunId }: { runId: string; stepRunId: string }) =>
      workflowsApi.rejectStep(selectedCompanyId!, runId, stepRunId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.runs(selectedCompanyId!, workflowId!),
      });
      pushToast({ title: "Step rejected", tone: "warn" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to reject step", body: (err as Error).message, tone: "error" });
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!workflow) return null;

  const steps = workflow.steps ?? [];

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Workflow className="h-5 w-5 text-muted-foreground shrink-0" />
          <h2 className="text-lg font-bold truncate">{workflow.name}</h2>
          <Badge variant="secondary" className={statusColors[workflow.status] ?? statusColors.draft}>
            {workflow.status}
          </Badge>
          {workflow.triggerType && workflow.triggerType !== "manual" && (
            <Badge variant="outline" className="text-xs">
              {workflow.triggerType}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{steps.length} steps</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {workflow.status === "draft" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => updateWorkflow.mutate({ status: "active" })}
                  disabled={updateWorkflow.isPending}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Activate
                </Button>
              </TooltipTrigger>
              <TooltipContent>Make this workflow live and runnable</TooltipContent>
            </Tooltip>
          )}
          {workflow.status === "active" && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => startRun.mutate()}
                    disabled={startRun.isPending}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {startRun.isPending ? "Starting..." : "Run"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Execute this workflow now</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateWorkflow.mutate({ status: "paused" })}
                    disabled={updateWorkflow.isPending}
                  >
                    <Pause className="h-3.5 w-3.5 mr-1.5" />
                    Pause
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Temporarily disable this workflow</TooltipContent>
              </Tooltip>
            </>
          )}
          {workflow.status === "paused" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => updateWorkflow.mutate({ status: "active" })}
                  disabled={updateWorkflow.isPending}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Resume
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-activate this workflow</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {workflow.description && (
        <p className="text-sm text-muted-foreground -mt-2">{workflow.description}</p>
      )}

      {/* Tabs — Builder is default */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(`/workflows/${workflowId}/${value}`)}
      >
        <TabsList>
          <TabsTrigger value="builder">
            <Boxes className="h-3.5 w-3.5 mr-1.5" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Runs{runs && runs.length > 0 ? ` (${runs.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Builder tab — full visual DAG editor */}
        <TabsContent value="builder" className="mt-4">
          <WorkflowBuilder workflowId={workflowId!} />
        </TabsContent>

        {/* Runs tab — list + detail view */}
        <TabsContent value="runs" className="mt-4 space-y-3">
          {selectedRunId ? (
            <div className="space-y-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedRunId(null)}
              >
                &larr; Back to runs
              </Button>
              <WorkflowRunView
                runId={selectedRunId}
                onApprove={(stepRunId) =>
                  approveStep.mutate({ runId: selectedRunId, stepRunId })
                }
                onReject={(stepRunId) =>
                  rejectStep.mutate({ runId: selectedRunId, stepRunId })
                }
              />
            </div>
          ) : (
            <>
              {!runs || runs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">No runs yet.</p>
                  {workflow.status === "active" && (
                    <Button size="sm" onClick={() => startRun.mutate()} disabled={startRun.isPending}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Start First Run
                    </Button>
                  )}
                </div>
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      className="flex items-center gap-3 p-3 w-full text-left hover:bg-accent/50 transition-colors"
                    >
                      <span className="shrink-0">
                        {runStatusIcons[run.status] ?? runStatusIcons.pending}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            Run {run.id.slice(0, 8)}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {run.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(run.createdAt).toLocaleString()}
                          {run.finishedAt && (
                            <> &middot; Completed {new Date(run.finishedAt).toLocaleString()}</>
                          )}
                        </p>
                      </div>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
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
    </div>
  );
}
