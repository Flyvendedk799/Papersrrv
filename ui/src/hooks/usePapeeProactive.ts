import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { papeeApi, type PapeeHealthCheck } from "../api/papee";
import { useCompany } from "../context/CompanyContext";
import { usePapeeOptional } from "../context/PapeeContext";
import type { PapeeAnimState } from "../components/papee/PapeeSprites";

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Proactive monitoring hook — polls the Papee health endpoint
 * and makes Papee react visually to detected problems without user input.
 */
export function usePapeeProactive() {
  const papee = usePapeeOptional();
  const { selectedCompanyId } = useCompany();
  const lastReportedRef = useRef<string>("");
  const lastCompanyRef = useRef(selectedCompanyId);

  // Reset dedup on company change
  if (selectedCompanyId !== lastCompanyRef.current) {
    lastCompanyRef.current = selectedCompanyId;
    lastReportedRef.current = "";
  }

  const { data: health } = useQuery({
    queryKey: ["papee", "health", selectedCompanyId],
    queryFn: () => papeeApi.health(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!papee && papee.prefs.visible && !papee.prefs.muteReactions,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL - 5000,
  });

  useEffect(() => {
    if (!papee || !health) return;
    if (papee.prefs.muteReactions) return;

    const issues = Array.isArray(health.issues) ? health.issues : [];
    const healthy = health.healthy ?? true;

    const sig = JSON.stringify(issues.map((i) => `${i.type}:${i.agentId ?? i.issueId ?? ""}`));
    if (sig === lastReportedRef.current) return;
    lastReportedRef.current = sig;

    if (healthy || issues.length === 0) return;

    const critical = issues.find((i) => i.severity === "critical");
    const warn = issues.find((i) => i.severity === "warn");
    const top = critical ?? warn;

    if (!top) return;

    const mood: PapeeAnimState = critical ? "alarmed" : "thinking";
    papee.queueReaction(mood, 3000);

    if (issues.length === 1) {
      papee.showSpeechBubble(top.message, 5000);
    } else {
      papee.showSpeechBubble(
        `Found ${issues.length} issue${issues.length > 1 ? "s" : ""}: ${top.message}${issues.length > 1 ? ` and ${issues.length - 1} more` : ""}`,
        5000,
      );
    }
  }, [health, papee]);
}
