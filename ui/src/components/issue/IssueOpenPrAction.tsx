/**
 * IssueOpenPrAction — "Open draft PR" button on the issue page.
 *
 * Clicking the button calls the server's open-pr endpoint, which
 * resolves the project's repo, creates a paperclip/<id>-<slug>
 * branch from the default, and opens a draft PR with body
 * synthesised from the case's title + description.
 *
 * If the project has no repoUrl configured, the server returns 422
 * and we surface a calm "set a repo on the project first" message
 * instead of crashing.
 *
 * On success we (a) flash the new PR url + an "Open in GitHub"
 * link and (b) invalidate the case synthesis so the PR shows up
 * as a new artifact in the "What was made" chapter.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import { githubApi, type OpenPrForIssueResult } from "../../api/github";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";

interface Props {
  companyId: string;
  issueId: string;
  hasProject: boolean;
  className?: string;
}

export function IssueOpenPrAction({ companyId, issueId, hasProject, className }: Props) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<OpenPrForIssueResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openPr = useMutation({
    mutationFn: () => githubApi.openPrForIssue(companyId, issueId),
    onSuccess: (data) => {
      setOpened(data);
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.synthesis(issueId) });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    },
  });

  if (!hasProject) {
    // Render nothing rather than a disabled-looking dead button.
    // The user should add the issue to a project first; that's a
    // separate UX path already exposed in the sidebar properties.
    return null;
  }

  if (opened) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 h-8 border border-[var(--boared-success,#6fa67d)] bg-[var(--boared-success,#6fa67d)]/10",
          className,
        )}
      >
        <GitPullRequest className="h-3.5 w-3.5 text-[var(--boared-success,#6fa67d)]" />
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-foreground">
          Draft PR #{opened.pullRequest.number}
        </span>
        <a
          href={opened.pullRequest.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-success,#6fa67d)] no-underline hover:underline decoration-dotted underline-offset-2"
        >
          Open in GitHub <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={() => openPr.mutate()}
        disabled={openPr.isPending}
        title="Create a draft PR with body drafted from this case"
        className={cn(
          "inline-flex items-center gap-2 self-start px-3 h-8 border border-foreground text-foreground",
          "font-mono text-[0.6rem] uppercase tracking-[0.14em]",
          "hover:bg-foreground hover:text-background transition-colors",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      >
        {openPr.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <GitPullRequest className="h-3.5 w-3.5" />
        )}
        Open draft PR
      </button>
      {errorMsg && (
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-destructive">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
