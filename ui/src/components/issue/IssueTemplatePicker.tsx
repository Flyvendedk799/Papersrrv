/**
 * IssueTemplatePicker (F5) — popover that lists company issue
 * templates and, on pick, instantiates a new issue. Variables (if
 * declared by the template) prompt for values inline before the
 * issue is created.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Loader2, X, Plus } from "lucide-react";
import type { IssueTemplate } from "@paperclipai/shared";
import { issuesApi } from "../../api/issues";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";

interface Props {
  companyId: string;
  onPicked: (issueId: string) => void;
  onClose: () => void;
}

export function IssueTemplatePicker({ companyId, onPicked, onClose }: Props) {
  const { pushToast } = useToast();
  const [stagedTemplate, setStagedTemplate] = useState<IssueTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: templates, isLoading } = useQuery({
    queryKey: ["issue-templates", companyId],
    queryFn: () => issuesApi.listTemplates(companyId),
  });

  const instantiate = useMutation({
    mutationFn: () => {
      if (!stagedTemplate) throw new Error("No template staged");
      return issuesApi.instantiateTemplate(companyId, {
        templateId: stagedTemplate.id,
        values,
      });
    },
    onSuccess: (issue) => {
      pushToast({ tone: "info", title: "Issue created from template" });
      onPicked(issue.id);
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Create failed",
      }),
  });

  const missingRequired =
    (stagedTemplate?.variables ?? []).some((v) => v.required && !values[v.name]?.trim());

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--boared-paper)] border border-[var(--boared-rule)] w-full max-w-md">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--boared-rule)]">
          <h2 className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            {stagedTemplate ? "Fill template" : "Start from template"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-auto">
          {!stagedTemplate ? (
            <>
              {isLoading && (
                <p className="font-mono text-[0.7rem] text-[var(--boared-ink-faint)]">
                  Loading templates…
                </p>
              )}
              {!isLoading && (!templates || templates.length === 0) && (
                <p className="font-serif italic text-[0.92rem] text-[var(--boared-ink)]">
                  No templates yet. Save a plan or an issue as a template to re-use it.
                </p>
              )}
              {(templates ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setStagedTemplate(t);
                    const initial: Record<string, string> = {};
                    for (const v of t.variables ?? []) {
                      if (v.default) initial[v.name] = v.default;
                    }
                    setValues(initial);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 p-3 text-left border border-[var(--boared-rule)] hover:bg-[var(--boared-paper-2)]/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                  )}
                >
                  <FileText className="h-4 w-4 text-[var(--boared-ink-faint)] mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="font-serif italic text-[0.98rem] text-[var(--boared-ink)] truncate">
                      {t.name}
                    </div>
                    {t.description && (
                      <div className="text-[0.82rem] text-[var(--boared-ink-soft)] mt-0.5 line-clamp-2">
                        {t.description}
                      </div>
                    )}
                    <div className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-1">
                      {t.defaultKind} {t.defaultPriority ? `· ${t.defaultPriority}` : ""}
                      {t.variables && t.variables.length > 0 && (
                        <> · {t.variables.length} variable{t.variables.length === 1 ? "" : "s"}</>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="border border-dashed border-[var(--boared-rule)] p-3">
                <div className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] mb-1">
                  Preview
                </div>
                <p className="font-serif italic text-[1rem] text-[var(--boared-ink)]">
                  {substitute(stagedTemplate.titleTemplate, values)}
                </p>
                {stagedTemplate.bodyTemplate && (
                  <p className="text-[0.82rem] text-[var(--boared-ink-soft)] whitespace-pre-wrap mt-1 line-clamp-6">
                    {substitute(stagedTemplate.bodyTemplate, values)}
                  </p>
                )}
              </div>
              {(stagedTemplate.variables ?? []).length === 0 ? (
                <p className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                  No variables to fill.
                </p>
              ) : (
                (stagedTemplate.variables ?? []).map((v) => (
                  <label key={v.name} className="block">
                    <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
                      {v.label}
                      {v.required && <> · required</>}
                    </span>
                    <input
                      value={values[v.name] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={v.default ?? ""}
                      className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
                    />
                  </label>
                ))
              )}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setStagedTemplate(null)}
                  className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
                >
                  ← back
                </button>
                <button
                  type="button"
                  disabled={instantiate.isPending || missingRequired}
                  onClick={() => instantiate.mutate()}
                  className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-3 py-1.5 border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/10 disabled:opacity-50"
                >
                  {instantiate.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  )}
                  Create issue
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function substitute(s: string, values: Record<string, string>): string {
  return s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] ?? "" : m,
  );
}
