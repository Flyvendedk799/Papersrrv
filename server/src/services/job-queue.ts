/**
 * Background job queue — in-memory with BullMQ upgrade path.
 *
 * Currently uses setTimeout-based scheduling (single-instance personal deployment).
 * To upgrade for production (Phase 6):
 *   1. `pnpm add bullmq ioredis`
 *   2. Replace InMemoryJobQueue with BullMQJobQueue
 *   3. Add Bull Board dashboard for monitoring
 *   4. Configure REDIS_URL in environment
 *
 * Planned job types:
 *   - heartbeat-scheduler: replace polling loop with reliable scheduled jobs
 *   - file-indexer: async file indexing after agent runs
 *   - cost-aggregation: periodic cost rollup
 *   - budget-check: periodic budget threshold checks
 *   - backfill: async backfill operations
 */

import { logger } from "../middleware/logger.js";

export interface JobDefinition {
  name: string;
  handler: (data: Record<string, unknown>) => Promise<void>;
  /** Default delay in ms before processing */
  defaultDelayMs?: number;
  /** Number of retry attempts on failure */
  retries?: number;
}

export interface JobQueueService {
  register(definition: JobDefinition): void;
  enqueue(jobName: string, data: Record<string, unknown>, opts?: { delayMs?: number }): Promise<string>;
  /** Schedule a recurring job */
  schedule(jobName: string, data: Record<string, unknown>, intervalMs: number): string;
  /** Cancel a scheduled recurring job */
  cancelSchedule(scheduleId: string): void;
}

interface InFlightJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
}

class InMemoryJobQueue implements JobQueueService {
  private handlers = new Map<string, JobDefinition>();
  private schedules = new Map<string, ReturnType<typeof setInterval>>();
  private jobCounter = 0;

  register(definition: JobDefinition): void {
    this.handlers.set(definition.name, definition);
    logger.debug({ jobName: definition.name }, "job-queue: registered handler");
  }

  async enqueue(jobName: string, data: Record<string, unknown>, opts?: { delayMs?: number }): Promise<string> {
    const def = this.handlers.get(jobName);
    if (!def) throw new Error(`No handler registered for job: ${jobName}`);

    const jobId = `job_${++this.jobCounter}_${Date.now()}`;
    const delay = opts?.delayMs ?? def.defaultDelayMs ?? 0;

    setTimeout(async () => {
      const retries = def.retries ?? 0;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await def.handler(data);
          logger.debug({ jobId, jobName, attempt }, "job-queue: completed");
          return;
        } catch (err) {
          if (attempt < retries) {
            logger.warn({ err, jobId, jobName, attempt }, "job-queue: retrying");
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          } else {
            logger.error({ err, jobId, jobName }, "job-queue: failed after all retries");
          }
        }
      }
    }, delay);

    return jobId;
  }

  schedule(jobName: string, data: Record<string, unknown>, intervalMs: number): string {
    const scheduleId = `sched_${++this.jobCounter}_${Date.now()}`;
    const interval = setInterval(() => {
      this.enqueue(jobName, data).catch(err => {
        logger.error({ err, jobName, scheduleId }, "job-queue: scheduled job failed");
      });
    }, intervalMs);
    this.schedules.set(scheduleId, interval);
    logger.info({ scheduleId, jobName, intervalMs }, "job-queue: scheduled recurring job");
    return scheduleId;
  }

  cancelSchedule(scheduleId: string): void {
    const interval = this.schedules.get(scheduleId);
    if (interval) {
      clearInterval(interval);
      this.schedules.delete(scheduleId);
    }
  }
}

// ── BullMQ placeholder ───────────────────────────────────────────────────────
// Uncomment when Redis is available:
//
// import { Queue, Worker } from "bullmq";
// import Redis from "ioredis";
//
// class BullMQJobQueue implements JobQueueService {
//   private queues = new Map<string, Queue>();
//   private workers = new Map<string, Worker>();
//   private connection: Redis;
//   constructor(redisUrl: string) { this.connection = new Redis(redisUrl); }
//   register(def: JobDefinition) {
//     const queue = new Queue(def.name, { connection: this.connection });
//     const worker = new Worker(def.name, async job => def.handler(job.data), {
//       connection: this.connection,
//       concurrency: 1,
//     });
//     this.queues.set(def.name, queue);
//     this.workers.set(def.name, worker);
//   }
//   async enqueue(name: string, data: Record<string, unknown>, opts?: { delayMs?: number }) {
//     const queue = this.queues.get(name);
//     const job = await queue!.add(name, data, { delay: opts?.delayMs });
//     return job.id!;
//   }
//   schedule(name: string, data: Record<string, unknown>, intervalMs: number) {
//     const queue = this.queues.get(name);
//     queue!.add(name, data, { repeat: { every: intervalMs } });
//     return `repeat:${name}`;
//   }
//   cancelSchedule(scheduleId: string) { /* remove repeatable job */ }
// }

// ── Singleton ────────────────────────────────────────────────────────────────

let _jobQueue: JobQueueService | null = null;

export function getJobQueue(): JobQueueService {
  if (!_jobQueue) {
    // Future: check process.env.REDIS_URL and use BullMQJobQueue if available
    _jobQueue = new InMemoryJobQueue();
    logger.info("job-queue: initialized in-memory queue (upgrade to BullMQ+Redis for production)");
  }
  return _jobQueue;
}
