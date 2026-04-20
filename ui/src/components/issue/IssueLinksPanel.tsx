/**
 * IssueLinksPanel (F6) — renders and manages the issue's cross-issue
 * links (blocks / blocked_by / duplicates / duplicated_by / relates_to).
 *
 * Groups by kind. Inline typeahead to add; click ✕ to remove.
 * Auto-refreshes on mutation; the server maintains inverse rows.
 */

import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueLinkKind, IssueLinkApi } from "@paperclipai/shared";
import { Link2Off, Plus, Search, X } from "lucide-react";
import { issuesApi } from "../../api/issues";
import { useCompany } from "../../context/CompanyContext";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";
import { StatusIcon } from "../StatusIcon";

const LINK_KIND_LABELS: Record<IssueLinkKind, string> = {
  blocks: "Blocks",
  blocked_by: "Blocked by",
  duplicates: "Duplicates",
  duplicated_by: "Duplicated by",
  relates_to: "Relates to",
};

const LINK_KIND_ORDER: IssueLinkKind[] = [
  "blocked_by",
  "blocks",
  "duplicates",
  "duplicated_by",
  "relates_to",
];

export function IssueLinksPanel({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const [pickerKind, setPickerKind] = useState<IssueLinkKind | null>(null);
  const [query, setQuery] = useState("");

  const { data: links } = useQuery({
    queryKey: ["issue", issueId, "links"],
    queryFn: () => issuesApi.listLinks(issueId),
  });

  const { data: candidates } = useQuery({
    queryKey: ["issue-link-search", selectedCompanyId, query],
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: query }),
    enabled: !!selectedCompanyId && pickerKind != null && query.length > 1,
  });

  const add = useMutation({
    mutationFn: ({ targetIssueId, kind }: { targetIssueId: string; kind: IssueLinkKind }) =>
      issuesApi.addLink(issueId, { targetIssueId, kind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId, "links"] });
      setPickerKind(null);
      setQuery("");
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Link failed",
      }),
  });

  const remove = useMutation({
    mutationFn: (linkId: string) => issuesApi.removeLink(issueId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", issueId, "links"] }),
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Unlink failed",
      }),
  });

  const grouped = useMemo(() => {
    const byKind = new Map<IssueLinkKind, IssueLinkApi[]>();
    for (const l of links ?? []) {
      const arr = byKind.get(l.kind) ?? [];
      arr.push(l);
      byKind.set(l.kind, arr);
    }
    return byKind;
  }, [links]);

  const hasLinks = (links?.length ?? 0) > 0;

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Links
        </h3>
        <div className="flex items-center gap-1">
          {LINK_KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPickerKind(pickerKind === k ? null : k);
                setQuery("");
              }}
              className={cn(
                "font-mono text-[0.54rem] uppercase tracking-[0.14em] px-1.5 py-0.5 border transition-colors",
                pickerKind === k
                  ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
                  : "border-[var(--boared-rule)] text-[var(--boared-ink-faint)] hover:border-[var(--boared-ink)] hover:text-[var(--boared-ink)]",
              )}
            >
              + {LINK_KIND_LABELS[k].toLowerCase()}
            </button>
          ))}
        </div>
      </header>

      {pickerKind && (
        <div className="border border-[var(--boared-rule)] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <Search className="h-3 w-3 text-[var(--boared-ink-faint)]" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search an issue to mark as ${LINK_KIND_LABELS[pickerKind].toLowerCase()}…`}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--boared-ink-faint)]"
            />
            <button
              type="button"
              onClick={() => setPickerKind(null)}
              className="text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {(candidates ?? []).slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.id === issueId || add.isPending}
              onClick={() => add.mutate({ targetIssueId: c.id, kind: pickerKind })}
              className="flex items-center gap-2 w-full px-1 py-1 text-left hover:bg-[var(--boared-paper-2)]/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] disabled:opacity-40"
            >
              <StatusIcon status={c.status} />
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] shrink-0">
                {c.identifier ?? c.id.slice(0, 8)}
              </span>
              <span className="truncate text-xs">{c.title}</span>
            </button>
          ))}
        </div>
      )}

      {!hasLinks && !pickerKind && (
        <p className="font-serif italic text-[0.82rem] text-[var(--boared-ink-faint)]">
          No cross-issue links yet.
        </p>
      )}

      {LINK_KIND_ORDER.map((k) => {
        const rows = grouped.get(k);
        if (!rows || rows.length === 0) return null;
        return (
          <div key={k} className="space-y-0.5">
            <div className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
              {LINK_KIND_LABELS[k]} · {rows.length}
            </div>
            <ul className="space-y-0.5">
              {rows.map((l) => (
                <li
                  key={l.id}
                  className="group flex items-center gap-2 px-1 py-0.5 hover:bg-[var(--boared-paper-2)]/50"
                >
                  {l.target && <StatusIcon status={l.target.status} />}
                  <Link
                    to={`/issues/${l.target?.identifier ?? l.targetIssueId}`}
                    className="flex items-center gap-2 min-w-0 flex-1 no-underline text-inherit"
                  >
                    <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] shrink-0">
                      {l.target?.identifier ?? l.targetIssueId.slice(0, 8)}
                    </span>
                    <span className="truncate text-xs">
                      {l.target?.title ?? "(missing)"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove.mutate(l.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)]"
                    aria-label="Unlink"
                  >
                    <Link2Off className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
