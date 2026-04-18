/**
 * Issue handoff checklist panel (backlog 1.5 B3).
 *
 * Displayed in the issue sidebar. Shows the configurable list of
 * handoff requirements with advisory/required enforcement. When
 * enforcement = "required", all items must be checked before the
 * issue can be closed (enforced server-side too).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2, Shield, ShieldAlert } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { useFeatureFlag } from "../lib/featureFlags";
import { cn } from "../lib/utils";
import type { HandoffChecklistItem, HandoffEnforcement } from "@paperclipai/shared";

interface Props {
  companyId: string;
  issueId: string;
}

export function HandoffChecklistPanel({ companyId, issueId }: Props) {
  const enabled = useFeatureFlag("issue_handoff_checklist");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [newLabel, setNewLabel] = useState("");

  const { data: checklist, isLoading } = useQuery({
    queryKey: queryKeys.files.handoffChecklist(companyId, issueId),
    queryFn: () => filesApi.getHandoffChecklist(companyId, issueId),
    enabled: enabled && !!companyId && !!issueId,
  });

  const updateMutation = useMutation({
    mutationFn: (body: { enforcement?: HandoffEnforcement; items?: HandoffChecklistItem[] }) =>
      filesApi.updateHandoffChecklist(companyId, issueId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.handoffChecklist(companyId, issueId) });
    },
    onError: (err) => pushToast({ title: "Could not update checklist", body: (err as Error).message, tone: "error" }),
  });

  if (!enabled) return null;
  if (isLoading) return <div className="text-xs text-muted-foreground">Loading checklist…</div>;
  if (!checklist) return null;

  const items = checklist.items ?? [];
  const remaining = items.filter((i) => !i.checked).length;

  const toggleItem = (id: string) => {
    const next = items.map((it) =>
      it.id === id
        ? { ...it, checked: !it.checked, checkedAt: !it.checked ? new Date().toISOString() : null }
        : it,
    );
    updateMutation.mutate({ items: next });
  };

  const removeItem = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    updateMutation.mutate({ items: next });
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const item: HandoffChecklistItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      checked: false,
      checkedAt: null,
    };
    updateMutation.mutate({ items: [...items, item] });
    setNewLabel("");
  };

  const toggleEnforcement = () => {
    updateMutation.mutate({
      enforcement: checklist.enforcement === "required" ? "advisory" : "required",
    });
  };

  return (
    <section
      className="border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
      aria-labelledby="handoff-heading"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--boared-rule)]">
        <span
          id="handoff-heading"
          className="font-mono uppercase tracking-[0.08em] text-[0.66rem] text-muted-foreground"
        >
          Handoff checklist
        </span>
        {remaining > 0 && (
          <span className="font-mono text-[0.6rem] text-muted-foreground">
            {remaining} left
          </span>
        )}
        <button
          type="button"
          onClick={toggleEnforcement}
          className={cn(
            "ml-auto inline-flex items-center gap-1 font-mono uppercase text-[0.55rem] tracking-[0.08em] px-1.5 py-0.5 border",
            checklist.enforcement === "required"
              ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
              : "border-[var(--boared-rule)] text-muted-foreground",
          )}
          title={checklist.enforcement === "required" ? "Required (blocks close)" : "Advisory"}
        >
          {checklist.enforcement === "required" ? (
            <ShieldAlert className="h-3 w-3" />
          ) : (
            <Shield className="h-3 w-3" />
          )}
          {checklist.enforcement}
        </button>
      </header>

      <ul className="divide-y divide-[var(--boared-rule)]">
        {items.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground italic">
            No items yet — add the checks required to hand off this issue.
          </li>
        ) : items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2 px-3 py-1.5">
            <button
              type="button"
              onClick={() => toggleItem(it.id)}
              aria-pressed={it.checked}
              aria-label={it.checked ? `Mark ${it.label} as incomplete` : `Mark ${it.label} as complete`}
              className="text-muted-foreground hover:text-foreground"
            >
              {it.checked
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <Circle className="h-4 w-4" />}
            </button>
            <span className={cn(
              "text-xs flex-1",
              it.checked && "line-through text-muted-foreground",
            )}>
              {it.label}
            </span>
            <button
              type="button"
              onClick={() => removeItem(it.id)}
              aria-label={`Remove ${it.label}`}
              className="p-1 text-muted-foreground hover:text-[var(--boared-acid)] opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={addItem} className="flex gap-1 border-t border-[var(--boared-rule)] p-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Add checklist item…"
          className="flex-1 bg-background border border-[var(--boared-rule)] px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={!newLabel.trim() || updateMutation.isPending}
          className="font-mono uppercase text-[0.62rem] tracking-[0.08em] px-2 py-1 border border-foreground hover:bg-foreground hover:text-background disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </form>
    </section>
  );
}
