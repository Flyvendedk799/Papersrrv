import type { PapeeAnimState } from "./PapeeSprites";

/**
 * Maps live WebSocket events to Papee animation reactions and speech bubbles.
 */

// PCM agent ID — hardcoded for now; could be fetched from config
const PCM_AGENT_ID = "70f1f5c1-b14d-447c-85a6-eae21ebb9288";

type NameResolver = (agentId: string) => string | null;

export interface ReactionResult {
  animation: PapeeAnimState;
  durationMs: number;
  speechBubble?: string;
}

interface ReactionRule {
  eventType: string;
  match?: (payload: Record<string, unknown>) => boolean;
  react: (payload: Record<string, unknown>, nameOf: NameResolver) => ReactionResult;
}

const RULES: ReactionRule[] = [
  // PCM heartbeat started — Papee "is thinking"
  {
    eventType: "heartbeat.run.queued",
    match: (p) => p.agentId === PCM_AGENT_ID,
    react: () => ({
      animation: "thinking",
      durationMs: 0, // hold until completion
      speechBubble: "Checking on the team...",
    }),
  },

  // Other agent run started
  {
    eventType: "heartbeat.run.queued",
    match: (p) => p.agentId !== PCM_AGENT_ID,
    react: (p, nameOf) => {
      const name = nameOf(p.agentId as string) ?? "An agent";
      return {
        animation: "idle-look-around",
        durationMs: 2000,
        speechBubble: `${name} is starting a run...`,
      };
    },
  },

  // Run succeeded
  {
    eventType: "heartbeat.run.status",
    match: (p) => p.status === "succeeded",
    react: (p, nameOf) => {
      const name = nameOf(p.agentId as string) ?? "Agent";
      const isPcm = p.agentId === PCM_AGENT_ID;
      return {
        animation: "celebrating",
        durationMs: 2500,
        speechBubble: isPcm ? "All checked! Everything looks good." : `${name} finished successfully!`,
      };
    },
  },

  // Run failed or timed out
  {
    eventType: "heartbeat.run.status",
    match: (p) => p.status === "failed" || p.status === "timed_out",
    react: (p, nameOf) => {
      const name = nameOf(p.agentId as string) ?? "Agent";
      const reason = p.status === "timed_out" ? "timed out" : "failed";
      return {
        animation: "alarmed",
        durationMs: 3000,
        speechBubble: `Uh oh! ${name} ${reason}.`,
      };
    },
  },

  // Agent went into error state
  {
    eventType: "agent.status",
    match: (p) => p.status === "error",
    react: (p, nameOf) => {
      const name = nameOf(p.agentId as string) ?? "An agent";
      return {
        animation: "alarmed",
        durationMs: 3000,
        speechBubble: `${name} has errors!`,
      };
    },
  },

  // Issue marked done
  {
    eventType: "activity.logged",
    match: (p) => {
      const details = p.details as Record<string, unknown> | undefined;
      return p.action === "issue.updated" && details?.status === "done";
    },
    react: () => ({
      animation: "thumbs-up",
      durationMs: 2000,
      speechBubble: "Another issue done!",
    }),
  },

  // New issue created
  {
    eventType: "activity.logged",
    match: (p) => p.action === "issue.created",
    react: () => ({
      animation: "waving",
      durationMs: 1500,
    }),
  },

  // Secret granted to agent
  {
    eventType: "activity.logged",
    match: (p) => p.action === "secret.granted",
    react: (p) => {
      const details = p.details as Record<string, unknown> | undefined;
      return {
        animation: "thumbs-up",
        durationMs: 2000,
        speechBubble: `Gave ${details?.agentName ?? "agent"} access to ${details?.secretName ?? "a secret"}.`,
      };
    },
  },
];

/**
 * Evaluate a live event against all reaction rules.
 * Returns the first matching reaction, or null.
 */
export function evaluateReaction(
  eventType: string,
  payload: Record<string, unknown>,
  nameOf: NameResolver,
): ReactionResult | null {
  for (const rule of RULES) {
    if (rule.eventType !== eventType) continue;
    if (rule.match && !rule.match(payload)) continue;
    return rule.react(payload, nameOf);
  }
  return null;
}
