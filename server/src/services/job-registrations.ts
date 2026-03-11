import type { Db } from "@paperclipai/db";
import { getJobQueue } from "./job-queue.js";
import { logger } from "../middleware/logger.js";

export function registerAllJobs(db: Db) {
  const queue = getJobQueue();

  // 1. Heartbeat timer tick job
  queue.register({
    name: "heartbeat-tick",
    handler: async (_data) => {
      const { heartbeatService } = await import("./heartbeat.js");
      const heartbeat = heartbeatService(db);
      const result = await heartbeat.tickTimers(new Date());
      if (result.enqueued > 0) {
        logger.info({ ...result }, "job: heartbeat-tick enqueued runs");
      }
    },
    retries: 1,
  });

  // 2. Heartbeat orphan reaper
  queue.register({
    name: "heartbeat-reap-orphans",
    handler: async (_data) => {
      const { heartbeatService } = await import("./heartbeat.js");
      const heartbeat = heartbeatService(db);
      await heartbeat.reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 });
    },
    retries: 1,
  });

  // 3. File indexing job
  queue.register({
    name: "file-index-run",
    handler: async (data) => {
      const { indexRunFromLog } = await import("./file-indexer.js");
      const runId = data.runId as string;
      const companyId = data.companyId as string;
      const agentId = data.agentId as string;
      await indexRunFromLog(db, { id: runId, companyId, agentId });
      logger.debug({ runId }, "job: file-index-run completed");
    },
    retries: 2,
    defaultDelayMs: 2000, // slight delay to let log flush
  });

  // 4. Cost aggregation job
  queue.register({
    name: "cost-aggregation",
    handler: async (_data) => {
      const { budgetAlertService } = await import("./budget-alerts.js");
      const svc = budgetAlertService(db);
      const alerts = await svc.checkAllCompanies();
      if (alerts.length > 0) {
        logger.info({ alertCount: alerts.length }, "job: cost-aggregation found budget alerts");
      }
    },
    retries: 1,
  });

  // 5. Backfill job (for file re-indexing) — placeholder until fileService.backfillFromLogs is implemented
  // queue.register({
  //   name: "file-backfill",
  //   handler: async (data) => {
  //     const { fileService } = await import("./files.js");
  //     const svc = fileService(db);
  //     const companyId = data.companyId as string;
  //     const result = await svc.backfillFromLogs(companyId);
  //     logger.info({ companyId, ...result }, "job: file-backfill completed");
  //   },
  //   retries: 0,
  // });

  logger.info("job-queue: registered all job handlers");
  return queue;
}
