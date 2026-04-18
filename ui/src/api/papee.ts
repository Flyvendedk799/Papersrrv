import { api } from "./client";
import type { PapeeTool, PapeeToolResult } from "@paperclipai/shared";

export type {
  PapeeTool,
  PapeeToolKind,
  PapeeToolResult,
  PapeeRiskTier,
  PapeeCompanionMode,
  PapeeCompanionProfile,
  PapeeInteractionEvent,
  PapeeInteractionResponse,
  PapeeLiveSignal,
  PapeeMobileSnapshot,
  PapeeRitualId,
  PapeeRitualProgressResponse,
  PapeeRitualState,
  PapeeRitualTrack,
} from "@paperclipai/shared";
export { PAPEE_TOOL_TIER } from "@paperclipai/shared";

/**
 * Boared companion — legacy alias used by PapeeMobile.tsx. The canonical
 * type is `PapeeInteractionEvent["type"]`. Kept here for back-compat.
 */
export type PapeeInteractionEventType =
  | "pet"
  | "cue"
  | "toy"
  | "mission_step"
  | "swipe"
  | "chat_prompt"
  | "focus_action";

export interface PapeeAction {
  type: "navigate" | "wake_agent" | "show_issue" | "grant_secret";
  label: string;
  payload: Record<string, string>;
}

export interface PapeeChatResponse {
  response: string;
  actions?: PapeeAction[];
  tools?: PapeeTool[];
  followUps?: string[];
  topics?: string[];
  mood?: string;
}

export interface PapeeChatRequest {
  message: string;
  context: {
    page: string;
    agentId?: string;
    issueId?: string;
    projectId?: string;
    workflowId?: string;
    runId?: string;
  };
  history?: { role: "user" | "papee"; content: string }[];
}

export interface PapeeHealthIssue {
  type: "agent_error" | "stale_task" | "blocked_task" | "idle_agent_with_work" | "missing_secret";
  severity: "warn" | "critical";
  message: string;
  agentId?: string;
  issueId?: string;
  autoFixable?: boolean;
}

export interface PapeeHealthCheck {
  healthy: boolean;
  mood: string;
  issues: PapeeHealthIssue[];
}

export interface PapeeMemoryRow {
  id: string;
  type: string;
  content: string;
  confidence: number;
  createdBy: string;
  lastConfirmedAt: string;
}

export const papeeApi = {
  chat: (companyId: string, body: PapeeChatRequest) =>
    api.post<PapeeChatResponse>(`/companies/${companyId}/papee/chat`, body),
  health: (companyId: string) =>
    api.get<PapeeHealthCheck>(`/companies/${companyId}/papee/health`),
  enact: (companyId: string, tool: PapeeTool) =>
    api.post<PapeeToolResult>(`/companies/${companyId}/papee/enact`, { tool }),
  listMemory: (companyId: string, scope?: "shared" | "personal") =>
    api.get<{ rows: PapeeMemoryRow[] }>(
      `/companies/${companyId}/papee/memory${scope === "shared" ? "?scope=shared" : ""}`,
    ),
  remember: (
    companyId: string,
    body: { type: string; content: string; confidence?: number; shared?: boolean },
  ) => api.post<{ ok: boolean }>(`/companies/${companyId}/papee/memory`, body),
  /**
   * PAPEE_TOOLS_PLAN.md §Z.8 — Streaming chat helper.
   *
   * Opens an SSE-style POST stream and yields chunks plus a final
   * structured response. Returns an `AbortController` so the caller
   * can interrupt mid-stream (Z.8 click-to-stop).
   */
  chatStream: (
    companyId: string,
    body: PapeeChatRequest,
    handlers: {
      onChunk: (text: string) => void;
      onDone: (final: PapeeChatResponse) => void;
      onError: (err: string) => void;
    },
  ): { abort: () => void } => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/companies/${companyId}/papee/chat/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "include",
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body) {
          handlers.onError(`stream failed: ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const block of events) {
            const lines = block.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const event = eventLine?.slice(6).trim() ?? "message";
            const data = dataLine.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (event === "chunk") handlers.onChunk(parsed as string);
              else if (event === "done") handlers.onDone(parsed as PapeeChatResponse);
              else if (event === "error") handlers.onError(parsed.error ?? "stream error");
            } catch {
              /* ignore malformed event */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        handlers.onError((err as Error).message);
      }
    })();
    return { abort: () => controller.abort() };
  },
  forgetMemory: (companyId: string, opts?: { pattern?: string; scope?: "shared" | "personal" }) => {
    const params = new URLSearchParams();
    if (opts?.pattern) params.set("pattern", opts.pattern);
    if (opts?.scope) params.set("scope", opts.scope);
    const qs = params.toString();
    return api.delete<{ ok: boolean }>(
      `/companies/${companyId}/papee/memory${qs ? `?${qs}` : ""}`,
    );
  },

  /**
   * Boared companion — mobile/check-in snapshot used by PapeeMobile.
   */
  mobileSnapshot: (companyId: string) =>
    api.get<import("@paperclipai/shared").PapeeMobileSnapshot>(
      `/companies/${companyId}/papee/mobile-snapshot`,
    ),

  /**
   * Boared companion — record an interaction event (pet/cue/toy/mission_step/...).
   * Server endpoint is still being restored; the client is wired up so
   * the mobile surface can render a stable UX in the meantime.
   */
  interact: (
    companyId: string,
    event: {
      type: string;
      ritualId?: import("@paperclipai/shared").PapeeRitualId | null;
      idempotencyKey?: string | null;
      detail?: string | null;
      metadata?: Record<string, unknown> | null;
      payload?: Record<string, unknown>;
    },
  ) =>
    api.post<import("@paperclipai/shared").PapeeInteractionResponse>(
      `/companies/${companyId}/papee/interact`,
      event,
    ),

  /**
   * Boared companion — advance or complete a ritual for the current user.
   * PapeeMobile calls this as `progressRitual(companyId, ritualId, body)`.
   */
  progressRitual: (
    companyId: string,
    ritualId: import("@paperclipai/shared").PapeeRitualId,
    body: {
      action?: "advance" | "complete";
      idempotencyKey?: string | null;
    },
  ) =>
    api.post<import("@paperclipai/shared").PapeeRitualProgressResponse>(
      `/companies/${companyId}/papee/rituals/${ritualId}/progress`,
      body,
    ),
};
