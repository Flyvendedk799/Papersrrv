import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, relativeTime } from "../lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/boared/PageHeader";
import {
  Pencil,
  Check,
  X,
  Plus,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

export function Companies() {
  const {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    loading,
    error,
  } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
  });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) =>
      companiesApi.update(id, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companiesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      setConfirmDeleteId(null);
    },
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Companies" }]);
  }, [setBreadcrumbs]);

  function startEdit(companyId: string, currentName: string) {
    setEditingId(companyId);
    setEditName(currentName);
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    editMutation.mutate({ id: editingId, newName: editName.trim() });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§19 · Organizations</>}
        title={
          <>
            Your <em>organizations.</em>
          </>
        }
        dateline={`${companies.length} on the register`}
        actions={
          <Button variant="acid" size="sm" onClick={() => openOnboarding()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New organization
          </Button>
        }
      />

      <div className="h-6 mb-2">
        {loading && (
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            Loading organizations…
          </p>
        )}
        {error && (
          <p className="font-mono text-[0.7rem] text-destructive">
            {error.message}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--boared-rule)]">
        {companies.map((company) => {
          const selected = company.id === selectedCompanyId;
          const isEditing = editingId === company.id;
          const isConfirmingDelete = confirmDeleteId === company.id;
          const companyStats = stats?.[company.id];
          const agentCount = companyStats?.agentCount ?? 0;
          const issueCount = companyStats?.issueCount ?? 0;
          const budgetPct =
            company.budgetMonthlyCents > 0
              ? Math.round(
                  (company.spentMonthlyCents / company.budgetMonthlyCents) * 100,
                )
              : 0;

          return (
            <div
              key={company.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCompanyId(company.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCompanyId(company.id);
                }
              }}
              className={`group relative border-b border-[var(--boared-rule)] px-4 py-5 cursor-pointer transition-colors ${
                selected
                  ? "bg-foreground/[0.04] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--boared-acid)]"
                  : "hover:bg-foreground/[0.025]"
              }`}
            >
              {/* Header row: name + menu */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm max-w-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={saveEdit}
                        disabled={editMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h3 className="boared-display text-[1.5rem] leading-none text-foreground">
                        {company.name}
                      </h3>
                      <span className="font-mono uppercase tracking-[0.08em] text-[0.6rem] text-muted-foreground border border-[var(--boared-rule)] px-1.5 py-0.5">
                        {company.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(company.id, company.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {company.description && !isEditing && (
                    <p className="text-[0.82rem] text-muted-foreground mt-1.5 line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>

                {/* Three-dot menu */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => startEdit(company.id, company.name)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDeleteId(company.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete organization
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-6 mt-4 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted-foreground flex-wrap">
                <span>
                  <span className="text-foreground tabular-nums">{agentCount}</span>{" "}
                  {agentCount === 1 ? "agent" : "agents"}
                </span>
                <span aria-hidden className="text-[var(--boared-rule)]">·</span>
                <span>
                  <span className="text-foreground tabular-nums">{issueCount}</span>{" "}
                  {issueCount === 1 ? "issue" : "issues"}
                </span>
                <span aria-hidden className="text-[var(--boared-rule)]">·</span>
                <span>
                  <span className="text-foreground tabular-nums">
                    {formatCents(company.spentMonthlyCents)}
                  </span>
                  {company.budgetMonthlyCents > 0 ? (
                    <>
                      {" / "}
                      <span className="tabular-nums">
                        {formatCents(company.budgetMonthlyCents)}
                      </span>{" "}
                      <span>({budgetPct}%)</span>
                    </>
                  ) : (
                    <span className="ml-1">· unlimited</span>
                  )}
                </span>
                <span className="ml-auto">
                  Opened {relativeTime(company.createdAt)}
                </span>
              </div>

              {/* Delete confirmation */}
              {isConfirmingDelete && (
                <div
                  className="mt-4 flex items-center justify-between gap-4 border border-destructive px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[0.82rem] text-destructive">
                    Delete this organization and all its data? This cannot be undone.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleteMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(company.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
