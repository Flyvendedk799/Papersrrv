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
import { WorkflowRunForm } from "../components/workflows/WorkflowRunForm";
import type { TriggerInput } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "../components/boared/PageHeader";
import { SectionRule } from "../components/boared/Kicker";
import { Wire, WireList } from "../components/boared/Wire";
import { Clipping } from "../components/boared/Clipping";
import { EmptyState as BoaredEmptyState } from "../components/boared/EmptyState";
import {
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

const runStatusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 text-foreground animate-spin" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />,
  failed: <XCircle className="h-3.5 w-3.5 text-[var(--boared-acid)]" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  awaiting_approval: <AlertTriangle className="h-3.5 w-3.5 text-[var(--boared-acid)]" />,
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
  const [showRunForm, setShowRunForm] = useState(false);

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
    mutationFn: (payload?: Record<string, unknown> | void) =>
      workflowsApi.startRun(selectedCompanyId!, workflowId!, payload ? { triggerPayload: payload } : undefined),
    onSuccess: () => {
      setShowRunForm(false);
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
  if (error) return <p className="font-mono text-[0.72rem] text-destructive">{(error as Error).message}</p>;
  if (!workflow) return null;

  const steps = workflow.steps ?? [];

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§09 · Workflows</>}
        title={<em className="not-italic font-normal">{workflow.name}</em>}
        dateline={
          <span className="inline-flex items-center gap-3">
            <span>{steps.length} steps</span>
            <span aria-hidden>·</span>
            <Badge variant="outline">{workflow.status.toUpperCase()}</Badge>
            {workflow.triggerType && workflow.triggerType !== "manual" && (
              <Badge variant="outline">{workflow.triggerType.toUpperCase()}</Badge>
            )}
            {workflow.description && (
              <>
                <span aria-hidden>·</span>
                <span className="text-muted-foreground">{workflow.description}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
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
                  onClick={() => {
                    const inputs = (workflow.triggerConfig as Record<string, unknown>)?.inputs;
                    if (Array.isArray(inputs) && inputs.length > 0) setShowRunForm(true);
                    else startRun.mutate();
                  }}
                  disabled={startRun.isPending}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {startRun.isPending ? "Starting..." : "Run"}
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
          </>
        }
      />

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
        <TabsContent value="runs" className="mt-4">
          {selectedRunId ? (
            <Clipping
              kicker={<>§ Run · {selectedRunId.slice(0, 8)}</>}
              title="Run detail"
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedRunId(null)}
                >
                  &larr; Back to runs
                </Button>
              }
            >
              <WorkflowRunView
                runId={selectedRunId}
                onApprove={(stepRunId) =>
                  approveStep.mutate({ runId: selectedRunId, stepRunId })
                }
                onReject={(stepRunId) =>
                  rejectStep.mutate({ runId: selectedRunId, stepRunId })
                }
              />
            </Clipping>
          ) : (
            <>
              {!runs || runs.length === 0 ? (
                <BoaredEmptyState
                  kicker="Workflow"
                  title="No runs on record yet."
                  description="Dispatch the first run to see steps, approvals, and outputs materialise here."
                  primaryAction={
                    workflow.status === "active"
                      ? {
                          label: startRun.isPending ? "Starting…" : "Start first run",
                          onClick: () => {
                            const inputs = (workflow.triggerConfig as Record<string, unknown>)?.inputs;
                            if (Array.isArray(inputs) && inputs.length > 0) setShowRunForm(true);
                            else startRun.mutate();
                          },
                        }
                      : undefined
                  }
                />
              ) : (
                <>
                  <SectionRule label="Run history" meta={`${runs.length} total`} />
                  <WireList>
                    {runs.map((run) => (
                      <Wire
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        leading={
                          <span className="flex items-center gap-2">
                            {runStatusIcons[run.status] ?? runStatusIcons.pending}
                            <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
                              {run.id.slice(0, 8)}
                            </span>
                          </span>
                        }
                        title={
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge variant="outline">{run.status.toUpperCase()}</Badge>
                            <span className="text-muted-foreground truncate text-[0.78rem]">
                              {new Date(run.createdAt).toLocaleString()}
                              {run.finishedAt && (
                                <> · Completed {new Date(run.finishedAt).toLocaleString()}</>
                              )}
                            </span>
                          </div>
                        }
                        trailing={<Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                      />
                    ))}
                  </WireList>
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="mt-4">
          <SectionRule label="Configuration" />
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
              <Label htmlFor="edit-trigger">Trigger type</Label>
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
              {updateWorkflow.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>

          <SectionRule label="Danger zone" />
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
              {deleteWorkflow.isPending ? "Deleting..." : "Delete workflow"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {showRunForm && (
        <WorkflowRunForm
          inputs={((workflow.triggerConfig as Record<string, unknown>)?.inputs ?? []) as TriggerInput[]}
          onSubmit={(payload) => startRun.mutate(payload)}
          onCancel={() => setShowRunForm(false)}
          isPending={startRun.isPending}
        />
      )}
    </div>
  );
}
