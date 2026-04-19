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
import { PageHeader } from "../components/boared/PageHeader";
import { SectionRule } from "../components/boared/Kicker";
import { Wire, WireList } from "../components/boared/Wire";
import { cn } from "@/lib/utils";
import { Workflow, Plus, Sparkles, Loader2, LayoutTemplate } from "lucide-react";

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§09 · The repertoire</>}
        title={
          <>
            The <em className="not-italic font-normal">script</em>
            <br />
            room.
          </>
        }
        dateline={todayDateline()}
        actions={
          workflows && workflows.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openDialog("blank")}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New script
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDialog("generate")}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Draft from a brief
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-6 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {(error as Error).message}
        </div>
      )}

      {workflows && workflows.length === 0 && (
        <EmptyState
          icon={Workflow}
          message="No scripts in the repertoire yet. Draft one to choreograph your correspondents."
          action="New script"
          onAction={() => openDialog()}
        />
      )}

      {workflows && workflows.length > 0 && (
        <>
          <SectionRule
            label="In rotation"
            meta={`${workflows.length} ${workflows.length === 1 ? "script" : "scripts"}`}
          />
          <WireList>
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to={`/workflows/${wf.id}`}
                className="block no-underline text-inherit"
              >
                <Wire
                  leading={
                    <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
                      {wf.id.slice(0, 6)}
                    </span>
                  }
                  title={
                    <div className="flex items-baseline gap-3 min-w-0">
                      <span className="font-medium truncate">{wf.name}</span>
                      {wf.description && (
                        <span className="text-muted-foreground truncate text-[0.78rem]">
                          {wf.description}
                        </span>
                      )}
                    </div>
                  }
                  meta={
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{wf.status.toUpperCase()}</Badge>
                      {wf.triggerType && wf.triggerType !== "manual" && (
                        <Badge variant="outline">{wf.triggerType.toUpperCase()}</Badge>
                      )}
                    </div>
                  }
                />
              </Link>
            ))}
          </WireList>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {createMode === "generate" ? "Generate workflow" : createMode === "template" ? "From template" : "New workflow"}
            </DialogTitle>
            <DialogDescription>
              {createMode === "generate"
                ? "Describe what you want and we'll generate the workflow steps automatically."
                : createMode === "template"
                  ? "Start from a pre-built template."
                  : "Create a blank workflow and build it visually."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode tabs — line-only */}
          <div className="flex border-b border-[var(--boared-rule)]">
            {([
              { mode: "blank" as const, label: "Blank", icon: Plus },
              { mode: "generate" as const, label: "AI generate", icon: Sparkles },
              { mode: "template" as const, label: "Template", icon: LayoutTemplate },
            ]).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setCreateMode(mode)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] transition-colors border-b-2 -mb-px",
                  createMode === mode
                    ? "border-[var(--boared-acid)] text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
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
                  className="w-full px-3 py-2 font-mono text-[0.78rem] border border-[var(--boared-rule)] bg-background resize-none outline-none focus:border-foreground"
                  rows={4}
                  placeholder={"Example: When an issue is created, have the senior product engineer analyze it, then the frontend engineer implements the UI, and finally junior dev (git) opens a PR. Include an approval gate before the PR step."}
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  autoFocus
                />
                <p className="font-mono text-[0.62rem] text-muted-foreground">
                  Describe the steps, agents involved, and any conditions or approvals needed.
                </p>
              </div>
            </div>
          )}

          {/* Template mode */}
          {createMode === "template" && (
            <div className="max-h-64 overflow-y-auto">
              {!templates || templates.length === 0 ? (
                <p className="font-mono text-[0.72rem] text-muted-foreground text-center py-4">
                  No templates available yet. Create workflows and save them as templates.
                </p>
              ) : (
                <WireList>
                  {templates.map((tmpl) => (
                    <Wire
                      key={tmpl.id}
                      onClick={() => instantiateTemplate.mutate(tmpl.id)}
                      leading={<LayoutTemplate className="h-4 w-4 text-muted-foreground" />}
                      title={
                        <div className="min-w-0">
                          <div className="font-medium">{tmpl.name}</div>
                          {tmpl.description && (
                            <div className="text-[0.72rem] text-muted-foreground mt-0.5 line-clamp-2">
                              {tmpl.description}
                            </div>
                          )}
                        </div>
                      }
                      meta={
                        <>
                          {tmpl.stepsJson?.length ?? 0} STEPS
                          {tmpl.category && <> · {tmpl.category.toUpperCase()}</>}
                          {tmpl.usageCount > 0 && <> · USED {tmpl.usageCount}×</>}
                        </>
                      }
                    />
                  ))}
                </WireList>
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
                  {isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating...</> : "Create workflow"}
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
            <p className="font-mono text-[0.7rem] text-destructive mt-2">
              {(generateWorkflow.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
