import { Router } from "express";
import { getJobQueue } from "../services/job-queue.js";

export function jobRoutes() {
  const router = Router();

  // GET /api/jobs/status - simple job queue status
  router.get("/jobs/status", (_req, res) => {
    const queue = getJobQueue();
    res.json({
      type: "in-memory",
      note: "Upgrade to BullMQ + Redis for production job monitoring",
      registeredJobs: (queue as any).handlers ? Array.from((queue as any).handlers.keys()) : [],
      activeSchedules: (queue as any).schedules ? (queue as any).schedules.size : 0,
    });
  });

  return router;
}
