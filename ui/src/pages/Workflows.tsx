import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { workflowsApi } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { Link } from "@/lib/router";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Workflow, Plus, ChevronRight, Play, Pause, Sparkles, Loader2, LayoutTemplate } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-muted/60 text-muted-foreground/60",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Play className="h-3 w-3" />;
    case "paused":
      return <Pause className="h-3 w-3" />;
    default:
      return null;
  }
}

type CreateMode = "blank" | "generate" | "template";

export function Workflows() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("blank");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [generatePrompt, setGeneratePrompt] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Workflows" }]);
  }, [setBreadcrumbs]);

  const {
    data: workflows,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.workflows.list(selectedCompanyId!),
    queryFn: () => workflowsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: templates } = useQuery({
    queryKey: [...queryKeys.workflows.list(selectedCompanyId!), "templates"],
    queryFn: () => workflowsApi.listTemplates(selectedCompanyId!),
    enabled: !!selectedCompanyId && dialogOpen && createMode === "template",
  });

  const createWorkflow = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      workflowsApi.create(selectedCompanyId!, data),
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.list(selectedCompanyId!) });
      setDialogOpen(false);
      resetForm();
      pushToast({ title: "Workflow created", body: wf.name, tone: "success" });
      navigate(`/workflows/${wf.id}/builder`);
    },
    onError: (err) => {
      pushToast({ title: "Failed to create workflow", body: (err as Error).message, tone: "error" });
    },
  });

  const generateWorkflow = useMutation({
    mutationFn: (data: { description: string }) =>
      workflowsApi.generate(selectedCompanyId!, data),
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.list(selectedCompanyId!) });
      setDialogOpen(false);
      resetForm();
      pushToast({ title: "Workflow generated", body: wf.name, tone: "success" });
      navigate(`/workflows/${wf.id}/builder`);
    },
    onError: (err) => {
      pushToast({ title: "Failed to generate workflow", body: (err as Error).message, tone: "error" });
    },
  });

  const instantiateTemplate = useMutation({
    mutationFn: (templateId: string) =>
      workflowsApi.instantiateTemplate(selectedCompanyId!, templateId),
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.list(selectedCompanyId!) });
      setDialogOpen(false);
      resetForm();
      pushToast({ title: "Workflow created from template", body: wf.name, tone: "success" });
      navigate(`/workflows/${wf.id}/builder`);
    },
    onError: (err) => {
      pushToast({ title: "Failed to create from template", body: (err as Error).message, tone: "error" });
    },
  });

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setGeneratePrompt("");
    setCreateMode("blank");
  };

  const openDialog = (mode: CreateMode = "blank") => {
    resetForm();
    setCreateMode(mode);
    setDialogOpen(true);
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={Workflow} message="Select a company to view workflows." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const isPending = createWorkflow.isPending || generateWorkflow.isPending;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {workflows && workflows.length === 0 && (
        <EmptyState
          icon={Workflow}
          message="No workflows yet. Create one to automate your agent pipelines."
          action="New Workflow"
          onAction={() => openDialog()}
        />
      )}

      {workflows && workflows.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => openDialog("blank")}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Workflow
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a blank workflow and build it visually</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => openDialog("generate")}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate with AI
                </Button>
              </TooltipTrigger>
              <TooltipContent>Describe your workflow in plain English and let AI build it</TooltipContent>
            </Tooltip>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to={`/workflows/${wf.id}`}
                className="group flex flex-col gap-3 border border-border rounded-lg bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-sm truncate">{wf.name}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {wf.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{wf.description}</p>
                )}

                <div className="flex items-center gap-2 mt-auto">
                  <Badge
                    variant="secondary"
                    className={statusColors[wf.status] ?? statusColors.draft}
                  >
                    <StatusIcon status={wf.status} />
                    {wf.status}
                  </Badge>
                  {wf.triggerType && wf.triggerType !== "manual" && (
                    <Badge variant="outline" className="text-xs">
                      {wf.triggerType}
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {createMode === "generate" ? "Generate Workflow" : createMode === "template" ? "From Template" : "New Workflow"}
            </DialogTitle>
            <DialogDescription>
              {createMode === "generate"
                ? "Describe what you want and we'll generate the workflow steps automatically."
                : createMode === "template"
                  ? "Start from a pre-built template."
                  : "Create a blank workflow and build it visually."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {([
              { mode: "blank" as const, label: "Blank", icon: Plus },
              { mode: "generate" as const, label: "AI Generate", icon: Sparkles },
              { mode: "template" as const, label: "Template", icon: LayoutTemplate },
            ]).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setCreateMode(mode)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  createMode === mode
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Blank mode */}
          {createMode === "blank" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wf-name">Name</Label>
                <Input
                  id="wf-name"
                  placeholder="e.g. Triage incoming issues"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wf-desc">Description</Label>
                <Input
                  id="wf-desc"
                  placeholder="What does this workflow do?"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Generate mode */}
          {createMode === "generate" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wf-gen">Describe your workflow</Label>
                <textarea
                  id="wf-gen"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  rows={4}
                  placeholder={"Example: When an issue is created, have the Senior Product Engineer analyze it, then the Frontend Engineer implements the UI, and finally Junior Dev (Git) opens a PR. Include an approval gate before the PR step."}
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  Describe the steps, agents involved, and any conditions or approvals needed.
                </p>
              </div>
            </div>
          )}

          {/* Template mode */}
          {createMode === "template" && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {!templates || templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No templates available yet. Create workflows and save them as templates.
                </p>
              ) : (
                templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => instantiateTemplate.mutate(tmpl.id)}
                    disabled={instantiateTemplate.isPending}
                    className="w-full flex items-start gap-3 p-3 text-left border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <LayoutTemplate className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{tmpl.name}</div>
                      {tmpl.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {tmpl.stepsJson?.length ?? 0} steps
                        {tmpl.category && <> &middot; {tmpl.category}</>}
                        {tmpl.usageCount > 0 && <> &middot; Used {tmpl.usageCount}x</>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {createMode !== "template" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              {createMode === "blank" ? (
                <Button
                  disabled={!newName.trim() || isPending}
                  onClick={() =>
                    createWorkflow.mutate({
                      name: newName.trim(),
                      description: newDescription.trim() || undefined,
                    })
                  }
                >
                  {isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating...</> : "Create Workflow"}
                </Button>
              ) : (
                <Button
                  disabled={!generatePrompt.trim() || isPending}
                  onClick={() => generateWorkflow.mutate({ description: generatePrompt.trim() })}
                >
                  {isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate</>
                  )}
                </Button>
              )}
            </DialogFooter>
          )}

          {generateWorkflow.error && (
            <p className="text-xs text-destructive mt-2">{(generateWorkflow.error as Error).message}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
