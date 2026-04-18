import { useEffect, useState } from "react";
import {
  BACKLOG_PLAN_KINDS,
  type BacklogPlan,
  type BacklogPlanKind,
  type CreateBacklogPlanInput,
  type UpdateBacklogPlanInput,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Create/edit a backlog plan (backlog3.0 D1).
 *
 * One dialog covers both paths to avoid a second file whose only
 * job is to flip an input placeholder. Mode is implied by the
 * `plan` prop: present = edit, absent = create.
 *
 * Date inputs use the native `<input type="date">` (UTC midnight)
 * to keep the shape aligned with the server which stores ISO
 * timestamps. Empty string means cleared.
 */

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  // Anchor at UTC midnight so "the day the user picked" survives
  // any display-side timezone jitter.
  const iso = new Date(`${value}T00:00:00.000Z`).toISOString();
  return iso;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When present, the dialog is in edit mode. */
  plan?: BacklogPlan | null;
  submitting: boolean;
  error: string | null;
  onCreate: (input: CreateBacklogPlanInput) => void;
  onUpdate: (id: string, input: UpdateBacklogPlanInput) => void;
}

export function PlanEditorDialog({
  open,
  onOpenChange,
  plan,
  submitting,
  error,
  onCreate,
  onUpdate,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<BacklogPlanKind>("sprint");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setTitle(plan.title);
      setDescription(plan.description ?? "");
      setKind(plan.kind);
      setStartsAt(toDateInputValue(plan.startsAt));
      setEndsAt(toDateInputValue(plan.endsAt));
      setProjectId(plan.projectId ?? "");
      setGoalId(plan.goalId ?? "");
    } else {
      setTitle("");
      setDescription("");
      setKind("sprint");
      setStartsAt("");
      setEndsAt("");
      setProjectId("");
      setGoalId("");
    }
  }, [open, plan]);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const common = {
      title: trimmed,
      description: description.trim() || null,
      kind,
      startsAt: fromDateInputValue(startsAt),
      endsAt: fromDateInputValue(endsAt),
      projectId: projectId.trim() || null,
      goalId: goalId.trim() || null,
    };
    if (plan) {
      onUpdate(plan.id, common);
    } else {
      onCreate(common);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Plan name"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Kind
              </label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as BacklogPlanKind)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKLOG_PLAN_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Start
                </label>
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  End
                </label>
                <Input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Project ID (optional)
              </label>
              <Input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="project-id"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Goal ID (optional)
              </label>
              <Input
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                placeholder="goal-id"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description (optional)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this plan for?"
              rows={3}
            />
          </div>
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
          >
            {submitting ? "Saving…" : plan ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
