import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent, LiveEvent } from "@paperclipai/shared";
import { usePapeeOptional } from "../context/PapeeContext";
import { useCompany } from "../context/CompanyContext";
import { liveEventListeners } from "../context/LiveUpdatesProvider";
import { evaluateReaction } from "../components/papee/papee-reactions";
import { queryKeys } from "../lib/queryKeys";

/**
 * Subscribes to live WebSocket events and triggers Papee reactions.
 * Must be rendered inside both PapeeProvider and LiveUpdatesProvider.
 */
export function usePapeeReactions() {
  const papee = usePapeeOptional();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!papee || !selectedCompanyId) return;
    if (papee.prefs.muteReactions) return;

    function nameOf(agentId: string): string | null {
      const agents = queryClient.getQueryData<Agent[]>(queryKeys.agents.list(selectedCompanyId!));
      if (!agents) return null;
      return agents.find((a) => a.id === agentId)?.name ?? null;
    }

    function onEvent(event: LiveEvent) {
      if (!papee) return;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const reaction = evaluateReaction(event.type, payload, nameOf);
      if (!reaction) return;

      papee.queueReaction(reaction.animation, reaction.durationMs);
      if (reaction.speechBubble) {
        papee.showSpeechBubble(reaction.speechBubble);
      }
    }

    liveEventListeners.add(onEvent);
    return () => {
      liveEventListeners.delete(onEvent);
    };
  }, [papee, selectedCompanyId, queryClient, papee?.prefs.muteReactions]);
}
