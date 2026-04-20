/**
 * PlanCommentThread (F5) — discussion thread on a backlog plan.
 * Parallels the existing backlog-item comment thread pattern.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backlogApi } from "../../../api/backlog";
import { useToast } from "../../../context/ToastContext";
import { Identity } from "../../Identity";
import { MarkdownBody } from "../../MarkdownBody";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn, relativeTime } from "../../../lib/utils";

export function PlanCommentThread({
  planId,
  companyId,
}: {
  planId: string;
  companyId: string;
}) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState("");

  const { data: comments, isLoading } = useQuery({
    queryKey: ["backlog", "plan", planId, "comments"],
    queryFn: () => backlogApi.listPlanComments(companyId, planId),
  });

  const create = useMutation({
    mutationFn: (body: string) => backlogApi.createPlanComment(companyId, planId, body),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["backlog", "plan", planId, "comments"] });
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Post failed",
      }),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) =>
      backlogApi.deletePlanComment(companyId, planId, commentId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["backlog", "plan", planId, "comments"] }),
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Delete failed",
      }),
  });

  const ordered = [...(comments ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        Discussion · {ordered.length}
      </h2>
      {isLoading ? (
        <p className="font-mono text-[0.7rem] text-[var(--boared-ink-faint)]">Loading…</p>
      ) : ordered.length === 0 ? (
        <p className="font-serif italic text-[0.9rem] text-[var(--boared-ink-faint)]">
          No discussion yet. Start the thread.
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((c) => (
            <li
              key={c.id}
              className="border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <Identity
                  name={c.authorAgent?.displayName ?? "You"}
                  size="xs"
                />
                <div className="flex items-center gap-2">
                  <time className="font-mono text-[0.58rem] text-[var(--boared-ink-faint)]">
                    {relativeTime(c.createdAt)}
                  </time>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this comment?")) remove.mutate(c.id);
                    }}
                    className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <MarkdownBody className="text-[0.88rem]">{c.body}</MarkdownBody>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 pt-2 border-t border-[var(--boared-rule)]">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add to the discussion…"
          className={cn("min-h-[72px]")}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={create.isPending || draft.trim().length === 0}
            onClick={() => create.mutate(draft.trim())}
          >
            {create.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </section>
  );
}
