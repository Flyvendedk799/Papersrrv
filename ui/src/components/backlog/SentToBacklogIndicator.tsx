/**
 * SentToBacklogIndicator — tiny badge + link shown on an origin surface
 * (Issue detail, run detail, workflow output) to tell users that the
 * current entity has already been captured to the Backlog Tab
 * (backlog3.0 C2).
 *
 * Behaviour:
 * - Renders nothing when the feature flag is off, when no company is
 *   selected, or when no backlog items match the source ref.
 * - Lookup is keyed by `source` + `sourceRef.id` (and optionally
 *   `sourceRef.type`) to match how `createBacklogItem` stamps captures.
 * - Clicking the indicator navigates to the Backlog tab. Deep-linking
 *   to the specific item lands with E2; for now the list + filter is
 *   enough to surface the capture.
 *
 * The component intentionally avoids showing error states: if the
 * lookup fails, the indicator simply stays hidden so origin surfaces
 * never surface a spurious "unknown" badge.
 */

import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Link } from "@/lib/router";
import { backlogApi } from "../../api/backlog";
import { useCompany } from "../../context/CompanyContext";
import { queryKeys } from "../../lib/queryKeys";
import { isFeatureEnabled } from "../../lib/featureFlags";
import { cn } from "../../lib/utils";

interface Props {
  source: string;
  sourceRefId?: string;
  sourceRefType?: string;
  className?: string;
}

export function SentToBacklogIndicator({
  source,
  sourceRefId,
  sourceRefType,
  className,
}: Props) {
  const { selectedCompanyId } = useCompany();
  const backlogEnabled = isFeatureEnabled("backlog_tab_enabled");

  const { data } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.backlog.bySource(selectedCompanyId, {
          source,
          sourceRefId,
          sourceRefType,
        })
      : ["backlog", "by-source", "disabled"],
    queryFn: () =>
      backlogApi.findBySource(selectedCompanyId!, {
        source,
        sourceRefId,
        sourceRefType,
      }),
    enabled: Boolean(
      backlogEnabled &&
        selectedCompanyId &&
        (sourceRefId || sourceRefType),
    ),
    staleTime: 30_000,
  });

  if (!backlogEnabled || !selectedCompanyId) return null;
  const count = data?.length ?? 0;
  if (count === 0) return null;

  const label = count === 1 ? "Sent to Backlog" : `Sent to Backlog (${count})`;
  return (
    <Link
      to="backlog"
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-600 px-2 py-0.5 text-[10px] font-medium hover:bg-amber-500/20",
        className,
      )}
      title={
        count === 1
          ? "Open the backlog item captured from this origin"
          : `${count} backlog items captured from this origin`
      }
    >
      <Inbox className="size-3" aria-hidden />
      {label}
    </Link>
  );
}
