import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { papeeApi } from "../api/papee";
import { useCompany } from "../context/CompanyContext";
import { usePapeeOptional } from "../context/PapeeContext";
import { queryKeys } from "../lib/queryKeys";

/**
 * Derives a short status line for the Papee chat header
 * based on the cached agent list and the health check data.
 */
export function usePapeeStatusLine(): string | null {
  const { selectedCompanyId } = useCompany();
  const papee = usePapeeOptional();
  const queryClient = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ["papee", "health", selectedCompanyId],
    queryFn: () => papeeApi.health(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!papee?.prefs.visible,
    // Reuse the same polling interval as usePapeeProactive — don't double-fetch
    staleTime: 25_000,
  });

  // Read cached agent list (populated by the agents page / dashboard queries)
  const agents = selectedCompanyId
    ? queryClient.getQueryData<Agent[]>(queryKeys.agents.list(selectedCompanyId))
    : undefined;

  if (!health && !agents) return null;

  // Prioritize issues
  if (health && !health.healthy && health.issues.length > 0) {
    const count = health.issues.length;
    return `${count} issue${count > 1 ? "s" : ""} need${count === 1 ? "s" : ""} attention`;
  }

  if (health?.healthy && agents) {
    const running = agents.filter((a) => a.status === "running" || a.status === "active").length;
    if (running > 0) return `Watching ${running} agent${running > 1 ? "s" : ""}`;
    return "All systems healthy";
  }

  if (health?.healthy) return "All systems healthy";

  if (agents) {
    const running = agents.filter((a) => a.status === "running" || a.status === "active").length;
    if (running > 0) return `Watching ${running} agent${running > 1 ? "s" : ""}`;
  }

  return null;
}
