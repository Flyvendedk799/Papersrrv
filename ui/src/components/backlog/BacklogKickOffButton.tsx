/**
 * BacklogKickOffButton — promote a backlog item AND start work on it
 * in one click.
 *
 *   click → pick agent → [promote] → [invoke heartbeat] → go to issue
 *
 * The single user action that closes the Boared loop:
 *   "I have an idea → it's an issue → an agent is on it → I can watch."
 *
 * Compared to the existing "Promote to Issue" button, this one also
 * sets the assignee and triggers a run, so the user lands on a live
 * case rather than a fresh todo.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Rocket } from "lucide-react";
import { agentsApi } from "../../api/agents";
import { backlogApi } from "../../api/backlog";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import type { Agent } from "@paperclipai/shared";

interface Props {
  companyId: string;
  backlogItemId: string;
  className?: string;
  /** Variant — `chip` is small and inline (list view); `button` is
   * full-size for the detail page. */
  variant?: "chip" | "button";
}

export function BacklogKickOffButton({
  companyId,
  backlogItemId,
  className,
  variant = "button",
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: open && !!companyId,
  });

  const eligibleAgents = useMemo(
    () => agents.filter((a) => a.status !== "terminated"),
    [agents],
  );

  const kickOff = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error("Pick an agent first");
      const promoted = await backlogApi.promoteItem(companyId, backlogItemId, {
        assigneeAgentId: agentId,
      });
      // Fire and forget heartbeat — if the adapter refuses we still
      // navigate to the new issue so the user can recover manually.
      try {
        await agentsApi.invoke(agentId, companyId);
      } catch {
        // swallow — non-fatal
      }
      return promoted;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["backlog", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      setOpen(false);
      navigate(`/issues/${data.issue.identifier ?? data.issue.id}`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    },
  });

  if (!open) {
    const baseStyles =
      variant === "chip"
        ? "inline-flex items-center gap-1 px-2 h-6 font-mono text-[0.54rem] uppercase tracking-[0.14em] border border-[var(--boared-rule)] text-muted-foreground hover:text-[var(--boared-acid)] hover:border-[var(--boared-acid)] transition-colors"
        : "inline-flex items-center gap-2 self-start px-3 h-8 border border-[var(--boared-acid)] text-[var(--boared-acid)] font-mono text-[0.6rem] uppercase tracking-[0.14em] hover:bg-[var(--boared-acid)] hover:text-background transition-colors";
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Promote to issue, assign an agent, and start the run"
        className={cn(baseStyles, className)}
      >
        <Rocket className={variant === "chip" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Kick off
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex flex-col gap-1.5 p-2 border border-[var(--boared-acid)] bg-[var(--boared-paper-2)]",
        className,
      )}
    >
      <label className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-acid)]">
        Pick an agent
      </label>
      <select
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
        className="px-2 h-7 text-[0.78rem] border border-[var(--boared-rule)] bg-[var(--boared-paper)]"
      >
        <option value="">— select —</option>
        {eligibleAgents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.role})
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!agentId || kickOff.isPending}
          onClick={() => kickOff.mutate()}
          className="inline-flex items-center gap-1 px-2 h-7 font-mono text-[0.58rem] uppercase tracking-[0.14em] border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)] hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {kickOff.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
          Go
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setErrorMsg(null);
          }}
          className="px-2 h-7 font-mono text-[0.58rem] uppercase tracking-[0.14em] border border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
      {errorMsg && (
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.12em] text-destructive">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
