import { useQuery } from "@tanstack/react-query";
import { papeeApi } from "../../api/papee";
import { useCompany } from "../../context/CompanyContext";
import { usePapeeOptional } from "../../context/PapeeContext";

const POLL_INTERVAL = 30_000;

/* ---- Tiny inline SVG eyes for each mood ---- */

/** Idle: simple round eyes */
function EyesIdle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="5" cy="8" r="1.8" fill="currentColor" />
      <circle cx="11" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Happy: curved smile eyes */
function EyesHappy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M3 9C3.8 7 5.2 6.5 6.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 8C10.8 6.5 12.2 7 13 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Alarmed: wide oval eyes */
function EyesAlarmed() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <ellipse cx="5" cy="8" rx="2.2" ry="2.8" fill="currentColor" />
      <ellipse cx="11" cy="8" rx="2.2" ry="2.8" fill="currentColor" />
      <circle cx="5.6" cy="7.2" r="0.7" fill="var(--background, white)" />
      <circle cx="11.6" cy="7.2" r="0.7" fill="var(--background, white)" />
    </svg>
  );
}

/* ---- Animation state dot ---- */

function AnimDot({ state }: { state: string }) {
  const base = "inline-block h-2 w-2 rounded-full shrink-0";

  switch (state) {
    case "thinking":
      return (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
      );
    case "celebrating":
      return <span className={`${base} bg-green-500`} />;
    case "alarmed":
      return (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      );
    default:
      return <span className={`${base} bg-muted-foreground/40`} />;
  }
}

/* ---- Status text ---- */

function useHealthStatus(companyId: string | null) {
  return useQuery({
    queryKey: ["papee", "health", companyId],
    queryFn: () => papeeApi.health(companyId!),
    enabled: !!companyId,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL - 5000,
  });
}

function StatusLine({ companyId }: { companyId: string | null }) {
  const { data: health } = useHealthStatus(companyId);

  if (!health) {
    return <span className="text-[11px] text-muted-foreground/60">...</span>;
  }

  const criticalCount = health.issues.filter((i) => i.severity === "critical").length;
  const totalIssues = health.issues.length;

  if (criticalCount > 0) {
    return (
      <span className="text-[11px] font-medium text-red-500 animate-pulse">
        Needs attention
      </span>
    );
  }

  if (totalIssues > 0) {
    return (
      <span className="text-[11px] font-medium text-amber-500">
        {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <span className="text-[11px] font-medium text-green-500">
      All clear
    </span>
  );
}

/* ---- Main widget ---- */

export function PapeeSidebarWidget() {
  const { selectedCompanyId } = useCompany();
  const papee = usePapeeOptional();

  if (!papee) return null;

  const animState = papee.animState;

  const Eyes =
    animState === "alarmed"
      ? EyesAlarmed
      : animState === "celebrating" || animState === "thumbs-up" || animState === "waving"
        ? EyesHappy
        : EyesIdle;

  return (
    <button
      onClick={() => papee.toggleChat()}
      className="group flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground/80 hover:text-foreground transition-colors rounded-md border-l-2 border-primary/40 bg-gradient-to-r from-primary/[0.04] to-transparent hover:from-primary/[0.08]"
    >
      {/* Tiny face */}
      <span className="relative shrink-0 text-foreground/70 group-hover:text-foreground transition-colors">
        <Eyes />
        {/* Anim state dot — top-right corner */}
        <span className="absolute -right-1 -top-0.5">
          <AnimDot state={animState} />
        </span>
      </span>

      {/* Label + status */}
      <span className="flex flex-col items-start min-w-0">
        <span className="truncate leading-tight">Papee</span>
        <StatusLine companyId={selectedCompanyId} />
      </span>
    </button>
  );
}
