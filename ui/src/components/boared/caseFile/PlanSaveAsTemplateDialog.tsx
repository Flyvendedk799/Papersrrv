/**
 * PlanSaveAsTemplateDialog (F10) — captures the current plan as a
 * reusable plan_template for the company. Variables (with labels)
 * are optional; the substitute happens at instantiation time in a
 * separate flow.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { PlanOutput } from "@paperclipai/shared";
import { backlogApi } from "../../../api/backlog";
import { useToast } from "../../../context/ToastContext";

export function PlanSaveAsTemplateDialog({
  plan,
  companyId,
  defaultName,
  onClose,
}: {
  plan: PlanOutput;
  companyId: string;
  defaultName: string;
  onClose: () => void;
}) {
  const { pushToast } = useToast();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      backlogApi.createTemplate(companyId, {
        name: name.trim(),
        description: description.trim() || null,
        planOutput: plan,
        variables: null,
      }),
    onSuccess: () => {
      pushToast({ tone: "info", title: "Template saved" });
      onClose();
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Save failed",
      }),
  });

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--boared-paper)] border border-[var(--boared-rule)] w-full max-w-md">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--boared-rule)]">
          <h2 className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            Save plan as template
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate();
          }}
          className="p-4 space-y-3"
        >
          <label className="block">
            <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="When to use this template, what to fill in…"
              className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            />
          </label>
          <p className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            Tip: reference placeholders like <code>{"{release_version}"}</code> inside
            step details. They'll prompt users when instantiating.
          </p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-3 py-1.5 border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/10 disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            >
              {create.isPending ? "Saving…" : "Save template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
