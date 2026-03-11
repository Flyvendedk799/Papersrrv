import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowsApi } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
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
import { Workflow, Plus, ChevronRight, Play, Pause } from "lucide-react";

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

export function Workflows() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

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

  const createWorkflow = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      workflowsApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.list(selectedCompanyId!) });
      setDialogOpen(false);
      setNewName("");
      setNewDescription("");
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Workflow} message="Select a company to view workflows." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {workflows && workflows.length === 0 && (
        <EmptyState
          icon={Workflow}
          message="No workflows yet."
          action="New Workflow"
          onAction={() => setDialogOpen(true)}
        />
      )}

      {workflows && workflows.length > 0 && (
        <>
          <div className="flex items-center justify-start">
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Workflow
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to={`/workflows/${wf.id}`}
                className="group flex flex-col gap-3 border border-border bg-card p-4 transition-colors hover:bg-accent/50"
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
                  {wf.triggerType && (
                    <Badge variant="outline" className="text-xs">
                      {wf.triggerType}
                    </Badge>
                  )}
                  {(wf as unknown as Record<string, unknown>).stepCount != null && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {String((wf as unknown as Record<string, unknown>).stepCount)} steps
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>Create a new workflow to automate tasks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                placeholder="e.g. Triage incoming issues"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">Description (optional)</Label>
              <Input
                id="wf-desc"
                placeholder="What does this workflow do?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || createWorkflow.isPending}
              onClick={() =>
                createWorkflow.mutate({
                  name: newName.trim(),
                  description: newDescription.trim() || undefined,
                })
              }
            >
              {createWorkflow.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
