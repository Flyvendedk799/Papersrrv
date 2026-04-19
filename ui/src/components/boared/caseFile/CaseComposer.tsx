/**
 * CaseComposer — lightweight reply box for the CaseFile thread drawer.
 *
 * Not a full-featured editor (no mentions, no image uploads, no
 * reassignment) — that's still the full Correspondence section
 * below-fold. This is the "leave a note right here" affordance so
 * readers don't have to scroll out of the hero to respond.
 *
 * Keyboard: ⌘↵ / Ctrl+↵ posts. Esc clears draft.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { cn } from "../../../lib/utils";

interface Props {
  issueId: string;
  className?: string;
}

export function CaseComposer({ issueId, className }: Props) {
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => issuesApi.addComment(issueId, body.trim()),
    onSuccess: () => {
      setBody("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issueId) });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    },
  });

  const post = () => {
    if (!body.trim()) return;
    if (mutation.isPending) return;
    mutation.mutate();
  };

  // Autogrow up to ~8 lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [body]);

  return (
    <div
      className={cn(
        "border-t border-[var(--boared-rule)] p-3 bg-[var(--boared-paper-2)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-2 transition-colors",
          focused && "border-[var(--boared-ink-soft)]",
        )}
      >
        <textarea
          ref={taRef}
          value={body}
          placeholder="Add a note to this case…"
          rows={2}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              post();
            } else if (e.key === "Escape" && !mutation.isPending) {
              setBody("");
            }
          }}
          disabled={mutation.isPending}
          className="bg-transparent outline-none resize-none text-[0.92rem] leading-snug text-[var(--boared-ink)] placeholder:text-[var(--boared-ink-faint)]"
        />
        <div className="flex items-center gap-2">
          {error && (
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-destructive">
              {error}
            </span>
          )}
          <span className="ml-auto font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            ⌘↵ to post · esc to clear
          </span>
          <button
            type="button"
            onClick={post}
            disabled={!body.trim() || mutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-acid)]/50",
              body.trim() && !mutation.isPending
                ? "border-[var(--boared-acid)]/70 text-[var(--boared-acid)] bg-[var(--boared-acid)]/[0.08] hover:bg-[var(--boared-acid)]/[0.18]"
                : "border-[var(--boared-rule)] text-[var(--boared-ink-faint)] cursor-not-allowed",
            )}
          >
            {mutation.isPending ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
