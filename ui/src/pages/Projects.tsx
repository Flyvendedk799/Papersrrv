import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, projectUrl } from "../lib/utils";
import { PageHeader } from "../components/boared/PageHeader";
import { Wire, WireList } from "../components/boared/Wire";
import { Hexagon, Plus } from "lucide-react";

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message="Select a company to view projects." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const count = projects?.length ?? 0;

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§07 · Projects</>}
        title={
          <>
            The <em>ledger</em> of
            <br />
            work in flight.
          </>
        }
        dateline={`${todayDateline()} · ${count} ${count === 1 ? "project" : "projects"} on file`}
        actions={
          <button
            type="button"
            onClick={openNewProject}
            className="inline-flex items-center gap-2 px-4 h-9 border border-foreground text-foreground font-mono text-[0.7rem] tracking-tight hover:bg-foreground hover:text-background transition-colors"
          >
            <Plus className="size-3.5" />
            <span>New project</span>
          </button>
        }
      />

      {error && (
        <div className="mb-6 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {projects && projects.length === 0 && (
        <EmptyState
          icon={Hexagon}
          message="No projects yet."
          action="New project"
          onAction={openNewProject}
        />
      )}

      {projects && projects.length > 0 && (
        <WireList>
          {projects.map((project) => (
            <Wire
              key={project.id}
              href={projectUrl(project)}
              leading={
                <span
                  aria-hidden
                  className="block size-2.5"
                  style={{ backgroundColor: project.color ?? "var(--boared-ink-faint)" }}
                />
              }
              title={
                <div className="min-w-0">
                  <div className="truncate text-foreground">{project.name}</div>
                  {project.description && (
                    <div className="truncate font-mono text-[0.68rem] text-muted-foreground mt-0.5">
                      {project.description}
                    </div>
                  )}
                </div>
              }
              meta={project.targetDate ? formatDate(project.targetDate) : undefined}
              trailing={<StatusBadge status={project.status} />}
            />
          ))}
        </WireList>
      )}
    </div>
  );
}
