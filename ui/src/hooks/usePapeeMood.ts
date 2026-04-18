import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { papeeApi } from "../api/papee";
import { useCompany } from "../context/CompanyContext";
import { deriveMood, type PapeeMood, type PapeeHealthSnapshot } from "../lib/papee-personality";

const HEALTH_POLL_MS = 30_000;

/**
 * Derives Papee's mood from health data.
 * Tracks consecutive healthy polls for the "happy" mood.
 */
export function usePapeeMood(): PapeeMood {
  const { selectedCompanyId } = useCompany();
  const consecutiveHealthyRef = useRef(0);

  const { data: health } = useQuery({
    queryKey: ["papee", "health", selectedCompanyId],
    queryFn: () => papeeApi.health(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: HEALTH_POLL_MS,
    staleTime: HEALTH_POLL_MS - 5000,
  });

  const lastMoodRef = useRef<PapeeMood>("curious");

  // Track consecutive healthy polls + dispatch incident-cleared transitions
  useEffect(() => {
    if (!health) return;
    if (health.healthy) {
      consecutiveHealthyRef.current++;
    } else {
      consecutiveHealthyRef.current = 0;
    }

    // PAPEE_TOOLS_PLAN.md §M.9 — fire `papee:incident-cleared` when
    // the mood transitions out of urgent. usePapeeProactiveSummaries
    // listens for this and offers a recap.
    const snapshot: PapeeHealthSnapshot = {
      healthy: health.healthy,
      criticalCount: health.issues.filter((i) => i.severity === "critical").length,
      warningCount: health.issues.filter((i) => i.severity === "warn").length,
    };
    const next = deriveMood(snapshot, consecutiveHealthyRef.current);
    if (lastMoodRef.current === "urgent" && next !== "urgent") {
      window.dispatchEvent(new CustomEvent("papee:incident-cleared"));
    }
    lastMoodRef.current = next;
  }, [health]);

  if (!health) return "curious";

  const snapshot: PapeeHealthSnapshot = {
    healthy: health.healthy,
    criticalCount: health.issues.filter((i) => i.severity === "critical").length,
    warningCount: health.issues.filter((i) => i.severity === "warn").length,
  };

  return deriveMood(snapshot, consecutiveHealthyRef.current);
}