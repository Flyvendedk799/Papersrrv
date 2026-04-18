import { useEffect } from "react";
import { telemetry } from "@/lib/papee-telemetry";
import { useCompany } from "@/context/CompanyContext";

/**
 * PAPEE_TOOLS_PLAN.md — mounts the telemetry logger and keeps its
 * target company id in sync. Call once from PapeeOverlay.
 */
export function usePapeeTelemetryMount() {
  const { selectedCompanyId } = useCompany();
  useEffect(() => {
    telemetry.setCompany(selectedCompanyId ?? null);
    telemetry.log("mount", { companyId: selectedCompanyId });
    return () => {
      void telemetry.flush();
    };
  }, [selectedCompanyId]);
}
