import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { count, sql } from "drizzle-orm";
import { instanceUserRoles } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
  } = {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      authReady: true,
      companyDeletionEnabled: true,
    },
) {
  const router = Router();

  router.get("/", async (_req, res) => {
    if (!db) {
      res.json({ status: "ok" });
      return;
    }

    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    if (opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";
    }

    const startTime = Date.now();
    let dbHealthy = true;
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbHealthy = false;
    }
    const dbLatencyMs = Date.now() - startTime;

    const mem = process.memoryUsage();

    res.json({
      status: "ok",
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      bootstrapStatus,
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
      checks: {
        database: { status: dbHealthy ? "healthy" : "unhealthy", latencyMs: dbLatencyMs },
      },
      uptime: process.uptime(),
      memoryUsage: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
