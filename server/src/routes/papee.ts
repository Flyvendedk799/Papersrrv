import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { papeeChatSchema } from "@paperclipai/shared";
import type { PapeeTool } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { papeeChatService, writePapeeTelemetry } from "../services/papee-chat.js";
import { papeeToolsService } from "../services/papee-tools.js";
import {
  remember,
  forget,
  recall,
  type PapeeMemoryType,
} from "../services/papee-memory.js";

export function papeeRoutes(db: Db) {
  const router = Router();

  router.post("/companies/:companyId/papee/chat", validate(papeeChatSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const svc = papeeChatService(db);
    const result = await svc.chat(companyId, req.body);
    res.json(result);
  });

  /* PAPEE_TOOLS_PLAN.md §Z.8 — Streaming chat over SSE.
   * Each stdout chunk from the Claude CLI is forwarded as a `chunk`
   * event so the client streaming bubble can grow token-by-token.
   * A final `done` event carries the full response + extracted
   * mood/followUps/topics. */
  router.post("/companies/:companyId/papee/chat/stream", validate(papeeChatSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const svc = papeeChatService(db);
    try {
      await svc.chatStream(companyId, req.body, {
        onChunk: (text: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify(text)}\n\n`);
        },
        onDone: (final: unknown) => {
          res.write(`event: done\ndata: ${JSON.stringify(final)}\n\n`);
          res.end();
        },
        onError: (err: string) => {
          res.write(`event: error\ndata: ${JSON.stringify({ error: err })}\n\n`);
          res.end();
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  });

  // PAPEE_TOOLS_PLAN.md — central tool dispatcher endpoint
  router.post("/companies/:companyId/papee/enact", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as { tool?: PapeeTool };
    const tool = body?.tool;
    if (!tool || typeof tool !== "object" || typeof (tool as { kind?: unknown }).kind !== "string") {
      res.status(400).json({ error: "missing or invalid `tool` payload" });
      return;
    }
    const actorRecord = (req as unknown as { actor?: { type?: string; userId?: string; agentId?: string } }).actor;
    const actorType: "user" | "agent" | "system" =
      actorRecord?.type === "agent" ? "agent" : actorRecord?.type === "board" ? "user" : "system";
    const actorId = actorRecord?.userId ?? actorRecord?.agentId ?? "system";
    const svc = papeeToolsService(db);
    try {
      const result = await svc.enact(companyId, tool, { type: actorType, id: actorId });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, summary: "tool execution failed", error: message });
    }
  });

  /* PAPEE_TOOLS_PLAN.md — client-side animation telemetry.
   * The UI batches and posts anim/scheduler/bubble/movement events
   * here every ~1.5s; each event lands in papee.log via papeeLog
   * with `event: telemetry.<kind>`. */
  router.post("/companies/:companyId/papee/telemetry", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as { events?: Array<{ event: string; t: number; meta?: Record<string, unknown> }> };
    const events = Array.isArray(body?.events) ? body.events.slice(0, 200) : [];
    if (events.length > 0) writePapeeTelemetry(companyId, events);
    res.json({ ok: true, count: events.length });
  });

  /* ─────── PAPEE_TOOLS_PLAN.md §M.11 — memory CRUD ─────── */

  router.get("/companies/:companyId/papee/memory", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = (req as unknown as { actor?: { userId?: string } }).actor;
    const userId = (req.query.scope as string) === "shared" ? null : (actor?.userId ?? null);
    const rows = await recall(db, { companyId, userId, limit: 200 });
    res.json({ rows });
  });

  router.post("/companies/:companyId/papee/memory", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as {
      type?: string;
      content?: string;
      confidence?: number;
      shared?: boolean;
    };
    if (!body?.type || !body?.content) {
      res.status(400).json({ error: "type and content required" });
      return;
    }
    const actor = (req as unknown as { actor?: { userId?: string } }).actor;
    await remember(db, {
      companyId,
      userId: body.shared ? null : (actor?.userId ?? null),
      type: body.type as PapeeMemoryType,
      content: body.content,
      confidence: body.confidence,
      createdBy: "stated",
    });
    res.json({ ok: true });
  });

  router.delete("/companies/:companyId/papee/memory", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = (req as unknown as { actor?: { userId?: string } }).actor;
    const pattern = req.query.pattern as string | undefined;
    await forget(db, {
      companyId,
      userId: (req.query.scope as string) === "shared" ? null : (actor?.userId ?? null),
      pattern,
    });
    res.json({ ok: true });
  });

  // Proactive health check — Papee polls this to detect problems and react visually
  router.get("/companies/:companyId/papee/health", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const svc = papeeChatService(db);
    const result = await svc.healthCheck(companyId);
    res.json(result);
  });

  // ---- Papee Logs: view structured logs for debugging and improvement ----

  router.get("/papee/logs", async (req, res) => {
    assertBoard(req);
    const svc = papeeChatService(db);
    const limit = parseInt(req.query.limit as string) || 200;
    const level = (req.query.level as string) || undefined;
    const since = (req.query.since as string) || undefined;
    const logs = await svc.readLogs({ limit, level, since });
    res.json(logs);
  });

  // Summary stats from logs
  router.get("/papee/logs/stats", async (req, res) => {
    assertBoard(req);
    const svc = papeeChatService(db);
    const since = (req.query.since as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const logs = await svc.readLogs({ limit: 5000, since });

    const stats = {
      total: logs.length,
      byLevel: {} as Record<string, number>,
      byEvent: {} as Record<string, number>,
      byHandler: {} as Record<string, number>,
      errors: logs.filter((l) => l.level === "error"),
      avgDurationMs: 0,
      slowest: null as { message?: string; durationMs?: number; handler?: string } | null,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const log of logs) {
      stats.byLevel[log.level] = (stats.byLevel[log.level] ?? 0) + 1;
      stats.byEvent[log.event] = (stats.byEvent[log.event] ?? 0) + 1;
      if (log.handler) {
        stats.byHandler[log.handler] = (stats.byHandler[log.handler] ?? 0) + 1;
      }
      if (log.durationMs != null) {
        totalDuration += log.durationMs;
        durationCount++;
        if (!stats.slowest || log.durationMs > (stats.slowest.durationMs ?? 0)) {
          stats.slowest = { message: log.message, durationMs: log.durationMs, handler: log.handler };
        }
      }
    }

    stats.avgDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    res.json(stats);
  });

  return router;
}