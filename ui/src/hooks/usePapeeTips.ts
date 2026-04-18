import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { papeeApi, type PapeeHealthCheck } from "../api/papee";
import { useCompany } from "../context/CompanyContext";
import { usePapeeOptional } from "../context/PapeeContext";
import { usePapeeNavigation } from "./usePapeePosition";
import {
  getNextTip,
  readShownTips,
  markTipShown,
} from "../components/papee/papee-tips";

const POLL_INTERVAL = 30_000;
const COOLDOWN_MS = 30_000;

/**
 * Proactive contextual tips hook.
 *
 * Evaluates tip conditions on page changes and health data changes,
 * then shows the highest-priority tip via the speech bubble and
 * reaction queue — respecting cooldowns and mute preferences.
 */
export function usePapeeTips() {
  const papee = usePapeeOptional();
  const { selectedCompanyId } = useCompany();
  const pageInfo = usePapeeNavigation();

  const lastTipAt = useRef(0);
  const pageEnteredAt = useRef(Date.now());
  const prevPage = useRef(pageInfo.page);
  const prevHealthy = useRef<boolean | null>(null);
  const hadProblems = useRef(false);
  const consecutiveSuccesses = useRef(0);

  // Reset page timer on page change
  if (pageInfo.page !== prevPage.current) {
    prevPage.current = pageInfo.page;
    pageEnteredAt.current = Date.now();
  }

  // Query health data (same cadence as usePapeeProactive)
  const { data: health } = useQuery({
    queryKey: ["papee", "health", selectedCompanyId],
    queryFn: () => papeeApi.health(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!papee && papee.prefs.visible && !papee.prefs.muteReactions,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL - 5000,
  });

  // Track consecutive successes and problem-resolution state
  useEffect(() => {
    if (!health) return;

    if (health.healthy) {
      // If we had problems before, mark them as resolved
      if (hadProblems.current) {
        hadProblems.current = false;
        // problemsResolved flag is handled inline when evaluating tips
      }
      // Count consecutive healthy polls as proxy for successful runs
      if (prevHealthy.current === true) {
        consecutiveSuccesses.current += 1;
      } else {
        consecutiveSuccesses.current = 1;
      }
    } else {
      hadProblems.current = true;
      consecutiveSuccesses.current = 0;
    }

    prevHealthy.current = health.healthy;
  }, [health]);

  // Evaluate and show tips whenever page or health changes
  useEffect(() => {
    if (!papee) return;
    if (papee.prefs.muteReactions) return;

    // Cooldown check
    const now = Date.now();
    if (now - lastTipAt.current < COOLDOWN_MS) return;

    const shownTips = readShownTips();

    const problemsResolved =
      prevHealthy.current === true && !hadProblems.current && shownTips.has("greeting");

    const tip = getNextTip({
      page: pageInfo.page,
      health,
      shownTips,
      pageEnteredAt: pageEnteredAt.current,
      consecutiveSuccesses: consecutiveSuccesses.current,
      problemsResolved: prevHealthy.current === true && hadProblems.current === false && shownTips.size > 1,
    });

    if (!tip) return;

    // Show the tip
    markTipShown(tip.key);
    lastTipAt.current = Date.now();

    papee.queueReaction(tip.animation, tip.durationMs);
    papee.showSpeechBubble(tip.text, tip.bubbleDurationMs);
  }, [pageInfo.page, health, papee]);
}
