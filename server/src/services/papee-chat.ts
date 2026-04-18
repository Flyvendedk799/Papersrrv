/**
 * Papee chat service (Boared rebrand, minimal recovery stub).
 *
 * The full implementation is still being restored from Claude session
 * logs. This file keeps the exported shape routes/papee.ts depends on
 * so the rest of the server builds and runs while the chat backend is
 * filled in. All methods return safe, conservative fallbacks.
 */

import type { Db } from "@paperclipai/db";
import type { PapeeChatResponse, PapeeAction } from "@paperclipai/shared";

type ChatRequestBody = {
  companyId?: string;
  message?: string;
  history?: Array<{ role: string; content: string }>;
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

type ChatStreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: (final: PapeeChatResponse) => void;
  onError: (err: string) => void;
};

export interface PapeeChatLogEntry {
  level: "info" | "warn" | "error" | "debug";
  event: string;
  handler?: string;
  message?: string;
  durationMs?: number;
  timestamp: string;
  [extra: string]: unknown;
}

export interface PapeeChatService {
  chat(companyId: string, body: ChatRequestBody): Promise<PapeeChatResponse>;
  chatStream(
    companyId: string,
    body: ChatRequestBody,
    callbacks: ChatStreamCallbacks,
  ): Promise<void>;
  healthCheck(companyId: string): Promise<{
    ok: boolean;
    checks: Array<{ name: string; ok: boolean; detail?: string }>;
    at: string;
  }>;
  readLogs(opts: { limit: number; level?: string; since?: string }): Promise<PapeeChatLogEntry[]>;
}

function emptyResponse(): PapeeChatResponse {
  return {
    response: "Papee chat is temporarily offline while the Boared surfaces finish redeploying.",
    actions: [] as PapeeAction[],
    tools: [],
    followUps: [],
    topics: [],
    mood: "neutral",
  };
}

export function papeeChatService(_db: Db): PapeeChatService {
  return {
    async chat() {
      return emptyResponse();
    },
    async chatStream(_companyId, _body, { onChunk, onDone }) {
      const response = emptyResponse();
      onChunk(response.response);
      onDone(response);
    },
    async healthCheck() {
      return {
        ok: true,
        checks: [
          { name: "papee-chat.stub", ok: true, detail: "stub service active" },
        ],
        at: new Date().toISOString(),
      };
    },
    async readLogs() {
      return [];
    },
  };
}

/**
 * Telemetry ingest stub. Real impl writes to papee.log; here we just
 * drop the batch silently so the UI telemetry loop doesn't error.
 */
export function writePapeeTelemetry(
  _companyId: string,
  _events: Array<{ event: string; t: number; meta?: Record<string, unknown> }>,
): void {
  // no-op recovery stub
}
