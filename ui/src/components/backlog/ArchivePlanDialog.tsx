import { useEffect, useState } from "react";
import type { BacklogPlan } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Archive a plan while preserving its items (backlog3.0 D1).
 *
 * When a plan is closed, its open items don't disappear — the user
 * picks one of two destinations for them:
 *  - "unplanned" (default): items drop back into the top-level
 *    triage queue.
 *  - another active plan: items move across, retaining their rank
 *    positions within the new plan's bucket.
 *
 * The caller owns the actual mutations (bulk move + archive plan)
 * so this dialog stays dumb and reusable.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: BacklogPlan | null;
  /** Number of non-archived items currently in this plan. */
  itemCount: number;
  /** Other active plans the user can move items into. */
  otherPlans: BacklogPlan[];
  submitting: boolean;
  error: string | null;
  onConfirm: (destination: { moveTo: string | null }) => void;
}

export function ArchivePlanDialog({
  open,
  onOpenChange,
  plan,
  itemCount,
  otherPlans,
  submitting,
  error,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<"unplanned" | "move">("unplanned");
  const [moveTargetId, setMoveTargetId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setMode("unplanned");
    setMoveTargetId(otherPlans[0]?.id ?? "");
  }, [open, otherPlans]);

  if (!plan) return null;

  const canConfirm =
    mode === "unplanned" ||
    (mode === "move" && moveTargetId && otherPlans.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive plan</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Archive <span className="font-medium">{plan.title}</span>?
            {itemCount > 0 && (
              <>
                {" "}
                It has{" "}
                <span className="font-medium">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>{" "}
                that need a new home.
              </>
            )}
          </p>

          {itemCount > 0 && (
            <div className="flex flex-col gap-2 rounded border border-border p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="archive-plan-mode"
                  checked={mode === "unplanned"}
                  onChange={() => setMode("unplanned")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Move to Unplanned</span>
                  <span className="block text-muted-foreground">
                    Items stay in the Backlog but lose plan assignment.
                  </span>
                </span>
              </label>
              <label
                className={`flex items-start gap-2 text-xs ${
                  otherPlans.length === 0
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="archive-plan-mode"
                  checked={mode === "move"}
                  disabled={otherPlans.length === 0}
                  onChange={() => setMode("move")}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="font-medium">Move to another plan</span>
                  <span className="block text-muted-foreground">
                    {otherPlans.length === 0
                      ? "No other active plans to move into."
                      : "Items are re-parented to the selected plan."}
                  </span>
                  {mode === "move" && otherPlans.length > 0 && (
                    <div className="mt-1.5">
                      <Select
                        value={moveTargetId}
                        onValueChange={setMoveTargetId}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select target plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {otherPlans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </span>
              </label>
            </div>
          )}

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
            variant="destructive"
            onClick={() => {
              onConfirm({
                moveTo: mode === "move" && moveTargetId ? moveTargetId : null,
              });
            }}
            disabled={submitting || !canConfirm}
          >
            {submitting ? "Archiving…" : "Archive plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
