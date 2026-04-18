/**
 * Evidence sets panel (backlog 2.0 B4 / 1.5 A2).
 *
 * Lists all evidence sets for the current issue, supports creating
 * new sets, adding/removing items, and a "Save selection to set"
 * flow that accepts candidate files from the relevance panel.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, FolderOpen, X, FileText } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { markFilePerf } from "../lib/filePerf";
import { cn } from "../lib/utils";
import type { IssueRelevantFile, IssueEvidenceSet, IssueEvidenceSetDetail } from "@paperclipai/shared";

interface Props {
  companyId: string;
  issueId: string;
  candidateFiles: IssueRelevantFile[];
}

export function EvidenceSetsPanel({ companyId, issueId, candidateFiles }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: sets, isLoading } = useQuery({
    queryKey: queryKeys.files.evidenceSets(companyId, issueId),
    queryFn: () => filesApi.listEvidenceSets(companyId, issueId),
    enabled: !!companyId && !!issueId,
  });

  const { data: detail } = useQuery({
    queryKey: expandedSetId
      ? [...queryKeys.files.evidenceSets(companyId, issueId), "detail", expandedSetId]
      : ["evidence-sets-noop"],
    queryFn: () => filesApi.getEvidenceSet(companyId, expandedSetId!),
    enabled: !!expandedSetId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => filesApi.createEvidenceSet(companyId, issueId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.evidenceSets(companyId, issueId) });
      setNewName("");
      setCreating(false);
      pushToast({ title: "Evidence set created", tone: "success" });
    },
    onError: (err) => pushToast({ title: "Could not create set", body: (err as Error).message, tone: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (setId: string) => filesApi.deleteEvidenceSet(companyId, setId),
    onSuccess: (_data, setId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.evidenceSets(companyId, issueId) });
      if (expandedSetId === setId) setExpandedSetId(null);
      pushToast({ title: "Evidence set deleted", tone: "info" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (params: { setId: string; f: IssueRelevantFile }) => {
      const t0 = performance.now();
      return filesApi.addItemToSet(companyId, params.setId, {
        snapshotId: params.f.snapshotId,
        filePath: params.f.filePath,
        contentHash: params.f.contentHash,
      }).finally(() => {
        markFilePerf("evidence_attach", performance.now() - t0, { target: "set" });
      });
    },
    onSuccess: (_data, v) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.files.evidenceSets(companyId, issueId), "detail", v.setId],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.evidenceSets(companyId, issueId) });
      pushToast({ title: "Added to set", tone: "success" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (params: { setId: string; itemId: string }) =>
      filesApi.removeItemFromSet(companyId, params.setId, params.itemId),
    onSuccess: (_data, v) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.files.evidenceSets(companyId, issueId), "detail", v.setId],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.evidenceSets(companyId, issueId) });
    },
  });

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono uppercase tracking-[0.08em] text-[0.62rem] text-muted-foreground">
            Evidence sets
          </span>
          {sets && <span className="text-[0.62rem] text-muted-foreground">({sets.length})</span>}
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground font-mono"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newName.trim();
            if (trimmed) createMutation.mutate(trimmed);
          }}
          className="flex items-center gap-2 mb-2"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Set name…"
            className="flex-1 bg-[var(--boared-paper)] border border-[var(--boared-rule)] px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !newName.trim()}
            className="font-mono uppercase text-[0.62rem] tracking-[0.08em] px-2 py-1 border border-foreground hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(""); }}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading sets…</div>
      ) : !sets?.length ? (
        <div className="text-xs text-muted-foreground italic">
          No evidence sets yet. Create one to curate the files that prove this issue.
        </div>
      ) : (
        <div className="space-y-1">
          {sets.map((s) => (
            <EvidenceSetRow
              key={s.id}
              set={s}
              expanded={expandedSetId === s.id}
              detail={expandedSetId === s.id ? detail : null}
              candidates={candidateFiles}
              onToggle={() => setExpandedSetId((v) => v === s.id ? null : s.id)}
              onDelete={() => {
                if (confirm(`Delete evidence set "${s.name}"?`)) deleteMutation.mutate(s.id);
              }}
              onAddItem={(f) => addItemMutation.mutate({ setId: s.id, f })}
              onRemoveItem={(itemId) => removeItemMutation.mutate({ setId: s.id, itemId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceSetRow({
  set, expanded, detail, candidates, onToggle, onDelete, onAddItem, onRemoveItem,
}: {
  set: IssueEvidenceSet;
  expanded: boolean;
  detail: IssueEvidenceSetDetail | null | undefined;
  candidates: IssueRelevantFile[];
  onToggle: () => void;
  onDelete: () => void;
  onAddItem: (f: IssueRelevantFile) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  const itemSnapshotIds = new Set((detail?.items ?? []).map((i) => i.snapshotId));
  const attachable = candidates.filter((c) => !itemSnapshotIds.has(c.snapshotId));

  return (
    <div className="border border-[var(--boared-rule)]">
      <header className={cn(
        "flex items-center gap-2 px-2 py-1.5",
        expanded && "bg-foreground/[0.03]",
      )}>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span className="text-xs font-medium truncate">{set.name}</span>
          <span className="font-mono text-[0.6rem] text-muted-foreground">{set.itemCount} {set.itemCount === 1 ? "file" : "files"}</span>
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete set"
          title="Delete set"
          className="p-1 text-muted-foreground hover:text-[var(--boared-acid)]"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </header>

      {expanded && (
        <div className="border-t border-[var(--boared-rule)] p-2 space-y-2">
          {(detail?.items ?? []).length === 0 ? (
            <div className="text-[0.7rem] text-muted-foreground italic">No files in this set yet.</div>
          ) : (
            <ul className="divide-y divide-[var(--boared-rule)]">
              {detail!.items.map((it) => (
                <li key={it.id} className="py-1 flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate text-[0.75rem]">{it.filePath}</span>
                  <button
                    onClick={() => onRemoveItem(it.id)}
                    aria-label="Remove"
                    className="ml-auto p-0.5 text-muted-foreground hover:text-[var(--boared-acid)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {attachable.length > 0 && (
            <div>
              <div className="font-mono uppercase text-[0.55rem] tracking-[0.08em] text-muted-foreground mb-1">
                Attach from relevant:
              </div>
              <div className="flex flex-wrap gap-1">
                {attachable.slice(0, 8).map((f) => (
                  <button
                    key={f.snapshotId}
                    onClick={() => onAddItem(f)}
                    className="text-[0.7rem] border border-[var(--boared-rule)] px-1.5 py-0.5 hover:border-foreground"
                  >
                    + {basename(f.filePath)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
