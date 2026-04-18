/**
 * GitHub pull request detail (backlog 4.0 B1 — foundation stub).
 *
 * Route: /:companyPrefix/github/repos/:owner/:repo/pulls/:number
 *
 * B1 scope (this commit):
 *   - Register the route so deep links resolve cleanly.
 *   - Render breadcrumbs and a placeholder page indicating that the
 *     richer PR detail (description, file list summary, checks,
 *     reviewers, actions) lands with B3 once `pr_actions` and the
 *     detail/files/reviews endpoints are wired.
 *
 * B3 scope (follow-up ticket): full detail rendering and comment/
 * approve/merge actions behind the `pr_actions` server flag.
 */

import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { GitPullRequest, Github } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageHeader } from "../components/boared/PageHeader";
import { EmptyState } from "../components/EmptyState";

export function GitHubPullDetail() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const prefix = selectedCompany?.issuePrefix ?? "";

  useEffect(() => {
    setBreadcrumbs([
      { label: "GitHub", href: prefix ? `/${prefix}/github` : undefined },
      {
        label: `${owner ?? "?"}/${repo ?? "?"}`,
        href:
          prefix && owner && repo
            ? `/${prefix}/github/repos/${owner}/${repo}`
            : undefined,
      },
      {
        label: "Pull requests",
        href:
          prefix && owner && repo
            ? `/${prefix}/github/repos/${owner}/${repo}/pulls`
            : undefined,
      },
      { label: `#${number ?? "?"}` },
    ]);
  }, [owner, repo, number, prefix, setBreadcrumbs]);

  if (!owner || !repo || !number) {
    return <EmptyState icon={Github} message="Missing PR identifier in URL." />;
  }

  return (
    <div className="boared-reveal mx-auto max-w-[1200px]">
      <PageHeader
        kicker={<>§§ · GitHub · {owner}/{repo} · PR #{number}</>}
        title={<>Pull request #{number}</>}
        dateline="detail view lands with backlog 4.0 B3"
      />

      <EmptyState
        icon={GitPullRequest}
        message="The PR detail page is coming online. B3 will wire the description, checks, reviewers, file summary, and the action bar (comment / approve / merge) behind the pr_actions flag."
      />
    </div>
  );
}
