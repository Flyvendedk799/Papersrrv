import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export function agentCollaborationRoutes(db: Db) {
  const router = Router();

  // ── Agent Messages ─────────────────────────────────────────────────────
  router.post("/companies/:companyId/agent-messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentMessagingService } = await import("../services/agent-messaging.js");
    const svc = agentMessagingService(db);
    const msg = await svc.send({ companyId, ...req.body });
    res.status(201).json(msg);
  });

  router.get("/companies/:companyId/agents/:agentId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentMessagingService } = await import("../services/agent-messaging.js");
    const svc = agentMessagingService(db);
    const messages = await svc.inbox(req.params.agentId as string, {
      unreadOnly: req.query.unread === "true",
      limit: Math.min(Number(req.query.limit) || 50, 200),
    });
    res.json(messages);
  });

  router.post("/companies/:companyId/agent-messages/:id/read", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentMessagingService } = await import("../services/agent-messaging.js");
    const svc = agentMessagingService(db);
    const agentId = req.body.agentId as string;
    const msg = await svc.markRead(req.params.id as string, agentId);
    res.json(msg);
  });

  router.get("/companies/:companyId/agent-messages/conversation", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentMessagingService } = await import("../services/agent-messaging.js");
    const svc = agentMessagingService(db);
    const agentA = req.query.agentA as string;
    const agentB = req.query.agentB as string;
    if (!agentA || !agentB) { res.status(400).json({ error: "agentA and agentB required" }); return; }
    const messages = await svc.conversation(agentA, agentB);
    res.json(messages);
  });

  router.post("/companies/:companyId/agent-messages/broadcast", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentMessagingService } = await import("../services/agent-messaging.js");
    const svc = agentMessagingService(db);
    const result = await svc.broadcast(companyId, req.body.fromAgentId, req.body.body, req.body.subject);
    res.json(result);
  });

  // ── Knowledge Base ─────────────────────────────────────────────────────
  router.get("/companies/:companyId/knowledge-base", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { knowledgeBaseService } = await import("../services/knowledge-base.js");
    const svc = knowledgeBaseService(db);
    const entries = await svc.list(companyId, {
      category: req.query.category as string | undefined,
      search: req.query.q as string | undefined,
      limit: Math.min(Number(req.query.limit) || 50, 200),
    });
    res.json(entries);
  });

  router.post("/companies/:companyId/knowledge-base", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { knowledgeBaseService } = await import("../services/knowledge-base.js");
    const svc = knowledgeBaseService(db);
    const entry = await svc.create({ companyId, ...req.body });
    res.status(201).json(entry);
  });

  router.get("/companies/:companyId/knowledge-base/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { knowledgeBaseService } = await import("../services/knowledge-base.js");
    const svc = knowledgeBaseService(db);
    const entry = await svc.getById(req.params.id as string);
    if (!entry) { res.status(404).json({ error: "Not found" }); return; }
    res.json(entry);
  });

  router.patch("/companies/:companyId/knowledge-base/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { knowledgeBaseService } = await import("../services/knowledge-base.js");
    const svc = knowledgeBaseService(db);
    const entry = await svc.update(req.params.id as string, req.body);
    res.json(entry);
  });

  router.delete("/companies/:companyId/knowledge-base/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { knowledgeBaseService } = await import("../services/knowledge-base.js");
    const svc = knowledgeBaseService(db);
    await svc.remove(req.params.id as string);
    res.json({ ok: true });
  });

  // ── Agent Capabilities ─────────────────────────────────────────────────
  router.get("/companies/:companyId/agents/:agentId/capabilities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const caps = await svc.getCapabilities(req.params.agentId as string);
    res.json(caps);
  });

  router.post("/companies/:companyId/agents/:agentId/capabilities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const result = await svc.setCapability(req.params.agentId as string, companyId, req.body.capability, req.body.proficiency);
    res.json(result);
  });

  router.delete("/companies/:companyId/agents/:agentId/capabilities/:capability", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    await svc.removeCapability(req.params.agentId as string, req.params.capability as string);
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/capabilities/:capability/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const agents = await svc.findAgentsByCapability(companyId, req.params.capability as string);
    res.json(agents);
  });

  // ── Task Outcomes & Auto-routing ───────────────────────────────────────
  router.post("/companies/:companyId/task-outcomes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const outcome = await svc.recordOutcome({ companyId, ...req.body });
    res.status(201).json(outcome);
  });

  router.get("/companies/:companyId/agents/:agentId/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const stats = await svc.getAgentStats(req.params.agentId as string);
    res.json(stats);
  });

  router.get("/companies/:companyId/suggest-agent", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const taskType = req.query.taskType as string;
    if (!taskType) { res.status(400).json({ error: "taskType query param required" }); return; }
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const suggestion = await svc.suggestAgent(companyId, taskType);
    res.json(suggestion ?? { agentId: null, message: "No agent with enough history for this task type" });
  });

  router.get("/companies/:companyId/agent-leaderboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentIntelligenceService } = await import("../services/agent-intelligence.js");
    const svc = agentIntelligenceService(db);
    const leaderboard = await svc.leaderboard(companyId);
    res.json(leaderboard);
  });

  return router;
}
