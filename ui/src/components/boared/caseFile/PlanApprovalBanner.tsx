/**
 * PlanApprovalBanner (F6) — renders at the top of BacklogPlanDetail
 * when a plan's approval_status is pending/approved/rejected.
 * Approvers can approve/reject inline; everyone else sees the state.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { BacklogPlan } from "@paperclipai/shared";
import { backlogApi } from "../../../api/backlog";
import { useToast } from "../../../context/ToastContext";
import { queryKeys } from "../../../lib/queryKeys";

export function PlanApprovalBanner({ plan }: { plan: BacklogPlan }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const approve = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      backlogApi.setPlanApproval(plan.companyId, plan.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.backlog.plan(plan.companyId, plan.id) });
      pushToast({ tone: "info", title: "Approval status updated" });
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Update failed",
      }),
  });

  if (plan.approvalStatus === "none") return null;

  if (plan.approvalStatus === "pending") {
    return (
      <div className="border border-[var(--boared-acid)]/50 bg-[var(--boared-acid)]/5 p-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-acid)]">
            Awaiting approval
          </div>
          <p className="font-serif italic text-[0.92rem] text-[var(--boared-ink)] mt-1">
            This plan is held for review. Items have not been seeded yet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => approve.mutate("approved")}
            disabled={approve.isPending}
            className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-2 py-1 border border-[var(--boared-success)] text-[var(--boared-success)] hover:bg-[var(--boared-success)]/10 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-success)]"
          >
            <Check className="h-3 w-3" aria-hidden="true" /> Approve
          </button>
          <button
            type="button"
            onClick={() => approve.mutate("rejected")}
            disabled={approve.isPending}
            className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-2 py-1 border border-[var(--boared-warn)] text-[var(--boared-warn)] hover:bg-[var(--boared-warn)]/10 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-warn)]"
          >
            <X className="h-3 w-3" aria-hidden="true" /> Reject
          </button>
        </div>
      </div>
    );
  }

  if (plan.approvalStatus === "rejected") {
    return (
      <div className="border border-[var(--boared-warn)]/40 bg-[var(--boared-warn)]/5 px-3 py-2 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-warn)]">
        Plan rejected
      </div>
    );
  }

  return (
    <div className="border border-[var(--boared-success)]/40 bg-[var(--boared-success)]/5 px-3 py-2 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-success)]">
      Plan approved
    </div>
  );
}
