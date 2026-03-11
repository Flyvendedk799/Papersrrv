import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export function auditRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/audit-log", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { auditLogService } = await import("../services/audit-log.js");
    const svc = auditLogService(db);
    const entries = await svc.query(companyId, {
      action: req.query.action as string | undefined,
      actorType: req.query.actorType as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      severity: req.query.severity as string | undefined,
      since: req.query.since ? new Date(req.query.since as string) : undefined,
      until: req.query.until ? new Date(req.query.until as string) : undefined,
      limit: Math.min(Number(req.query.limit) || 100, 500),
    });
    res.json(entries);
  });

  router.get("/companies/:companyId/audit-log/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { auditLogService } = await import("../services/audit-log.js");
    const svc = auditLogService(db);
    const days = Math.min(Number(req.query.days) || 30, 365);
    const stats = await svc.stats(companyId, days);
    res.json(stats);
  });

  router.get("/companies/:companyId/audit-log/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(req.query.until as string) : new Date();
    const { auditLogService } = await import("../services/audit-log.js");
    const svc = auditLogService(db);
    const exportData = await svc.exportForCompliance(companyId, since, until);
    res.setHeader("Content-Disposition", `attachment; filename=audit-log-${companyId}-${Date.now()}.json`);
    res.json(exportData);
  });

  return router;
}
