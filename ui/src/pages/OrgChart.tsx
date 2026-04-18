import { useEffect, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Network } from "lucide-react";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
 *  OrgChart → "The Roster"
 *
 *  The conventional org-chart canvas (boxes connected by lines, pan/zoom)
 *  has been replaced with an editorial press-room roster: a recursive
 *  byline list where each agent is a single typewritten line, indented by
 *  reporting depth, with hairline rules between layers.
 *
 *  Reads like a newspaper masthead listing — the editor at the top, the
 *  beat reporters indented under their bureau chief, etc. Same data shape
 *  as before; pure visualization swap.
 *
 *  No business logic changed: same `agentsApi.org()` query, same routing
 *  to agent detail pages on click.
 * ────────────────────────────────────────────────────────────────────── */

const roleLabels: Record<string, string> = {
  ceo: "Editor in chief",
  manager: "Bureau chief",
  ic: "Correspondent",
  contractor: "Contributor",
  consultant: "Consultant",
};

const statusLabels: Record<string, string> = {
  running: "On the wire",
  active: "On the wire",
  paused: "Stood down",
  idle: "Standing by",
  error: "In error",
  terminated: "Discharged",
};

interface RosterRowProps {
  node: OrgNode;
  depth: number;
}

function RosterRow({ node, depth }: RosterRowProps) {
  const roleLabel = roleLabels[node.role] ?? node.role;
  const statusLabel = statusLabels[node.status] ?? node.status;
  const isError = node.status === "error";
  const isInactive = node.status === "terminated" || node.status === "paused" || node.status === "idle";

  return (
    <>
      <Link
        to={agentUrl({ id: node.id, name: node.name })}
        className="group/roster grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-1 py-3 border-b border-[var(--boared-rule)] no-underline text-inherit hover:bg-foreground/[0.025] transition-colors"
        style={{ paddingLeft: `${depth * 32 + 4}px` }}
      >
        {/* Depth marker — small acid square or ink dot */}
        <span
          className={cn(
            "size-1.5 shrink-0 self-center",
            isError ? "bg-[var(--boared-acid)]" : isInactive ? "bg-muted-foreground/40" : "bg-foreground",
          )}
          aria-hidden
        />

        {/* Byline — name in mono caps */}
        <span
          className={cn(
            "font-mono uppercase tracking-[0.06em] text-[0.78rem] truncate",
            isInactive ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {node.name}
        </span>

        {/* Role */}
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground hidden sm:inline">
          {roleLabel}
        </span>

        {/* Status mark */}
        <span
          className={cn(
            "font-mono text-[0.6rem] uppercase tracking-[0.08em] tabular-nums",
            isError ? "text-[var(--boared-acid)]" : "text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </Link>

      {/* Recursive children */}
      {node.reports.map((child) => (
        <RosterRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Roster" }]);
  }, [setBreadcrumbs]);

  // Count totals for the dateline
  const counts = useMemo(() => {
    let total = 0;
    let onWire = 0;
    function walk(node: OrgNode) {
      total += 1;
      if (node.status === "running" || node.status === "active") onWire += 1;
      node.reports.forEach(walk);
    }
    (orgTree ?? []).forEach(walk);
    return { total, onWire };
  }, [orgTree]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to read the roster." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (!orgTree || orgTree.length === 0) {
    return <EmptyState icon={Network} message="No correspondents on the roster yet." />;
  }

  return (
    <div className="boared-reveal max-w-[1100px] mx-auto pb-32">
      {/* Editorial masthead */}
      <header className="grid grid-cols-12 gap-6 pb-8 mb-8 border-b-2 border-foreground">
        <div className="col-span-12 md:col-span-4 flex flex-col justify-end gap-3">
          <div className="boared-label text-foreground">§18 · The Roster</div>
          <div className="font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
            <span className="block">
              {counts.total} {counts.total === 1 ? "correspondent" : "correspondents"} on file
            </span>
            {counts.onWire > 0 && (
              <span className="block mt-1 text-foreground">
                <span className="inline-block size-1.5 bg-[var(--boared-acid)] mr-1.5 align-middle" />
                {counts.onWire} on the wire
              </span>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-8">
          <h1 className="boared-display text-[clamp(3rem,7vw,5.25rem)] leading-[0.92] text-foreground">
            The
            <br />
            <em className="not-italic font-normal">house.</em>
          </h1>
        </div>
      </header>

      {/* Roster — recursive byline list */}
      <div className="border-t border-foreground">
        {orgTree.map((root) => (
          <RosterRow key={root.id} node={root} depth={0} />
        ))}
      </div>

      {/* Colophon */}
      <footer className="mt-16 pt-4 border-t border-[var(--boared-rule)]">
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
          Indented by reporting line. Click any name to read the dossier.
        </p>
      </footer>
    </div>
  );
}
