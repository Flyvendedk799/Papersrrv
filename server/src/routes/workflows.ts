import { Router } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  workflows,
  workflowSteps,
  workflowEdges,
  workflowRuns,
  workflowStepRuns,
  workflowTemplates,
} from "@paperclipai/db";
import { workflowEngine as createWorkflowEngine } from "../services/workflow-engine.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { logger } from "../middleware/logger.js";

// ── DAG cycle detection ────────────────────────────────────────────────────────

function hasCycle(
  edges: { sourceStepId: string; targetStepId: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.sourceStepId);
    nodes.add(e.targetStepId);
    if (!adj.has(e.sourceStepId)) adj.set(e.sourceStepId, []);
    adj.get(e.sourceStepId)!.push(e.targetStepId);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (dfs(neighbor)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of nodes) {
    if (dfs(node)) return true;
  }
  return false;
}

// ── Route factory ──────────────────────────────────────────────────────────────

export function workflowRoutes(db: Db) {
  const router = Router();
  const engine = createWorkflowEngine(db);

  // ────────────────────────────────────────────────────────────────────────────
  // Workflow CRUD
  // ────────────────────────────────────────────────────────────────────────────

  // List workflows
  router.get("/companies/:companyId/workflows", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const status = req.query.status as string | undefined;
      const triggerType = req.query.triggerType as string | undefined;

      let conditions = eq(workflows.companyId, companyId);
      if (status) {
        conditions = and(conditions, eq(workflows.status, status))!;
      }
      if (triggerType) {
        conditions = and(conditions, eq(workflows.triggerType, triggerType))!;
      }

      const result = await db
        .select()
        .from(workflows)
        .where(conditions)
        .orderBy(desc(workflows.updatedAt));

      res.json(result);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to list workflows");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create workflow
  router.post("/companies/:companyId/workflows", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const actor = getActorInfo(req);
      const [workflow] = await db
        .insert(workflows)
        .values({
          companyId,
          name: req.body.name,
          description: req.body.description ?? null,
          status: req.body.status ?? "draft",
          triggerType: req.body.triggerType ?? "manual",
          triggerConfig: req.body.triggerConfig ?? {},
          templateId: req.body.templateId ?? null,
          metadata: req.body.metadata ?? {},
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          createdByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        })
        .returning();

      res.status(201).json(workflow);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to create workflow");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get workflow with steps and edges
  router.get("/companies/:companyId/workflows/:id", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const id = req.params.id as string;
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, id), eq(workflows.companyId, companyId)));

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, id))
        .orderBy(asc(workflowSteps.stepOrder));

      const edges = await db
        .select()
        .from(workflowEdges)
        .where(eq(workflowEdges.workflowId, id));

      res.json({ ...workflow, steps, edges });
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to get workflow");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update workflow
  router.patch("/companies/:companyId/workflows/:id", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const id = req.params.id as string;
      const [existing] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, id), eq(workflows.companyId, companyId)));

      if (!existing) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.triggerType !== undefined) updates.triggerType = req.body.triggerType;
      if (req.body.triggerConfig !== undefined) updates.triggerConfig = req.body.triggerConfig;
      if (req.body.metadata !== undefined) updates.metadata = req.body.metadata;

      const [updated] = await db
        .update(workflows)
        .set(updates)
        .where(and(eq(workflows.id, id), eq(workflows.companyId, companyId)))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to update workflow");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Soft delete workflow (set status to archived)
  router.delete("/companies/:companyId/workflows/:id", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const id = req.params.id as string;
      const [existing] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, id), eq(workflows.companyId, companyId)));

      if (!existing) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const [archived] = await db
        .update(workflows)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(workflows.id, id), eq(workflows.companyId, companyId)))
        .returning();

      res.json(archived);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to archive workflow");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Steps & Edges
  // ────────────────────────────────────────────────────────────────────────────

  // Add step
  router.post("/companies/:companyId/workflows/:id/steps", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)));

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const [step] = await db
        .insert(workflowSteps)
        .values({
          workflowId,
          companyId,
          name: req.body.name,
          description: req.body.description ?? null,
          stepOrder: req.body.stepOrder ?? 0,
          stepType: req.body.stepType,
          agentId: req.body.agentId ?? null,
          config: req.body.config ?? {},
          position: req.body.position ?? { x: 0, y: 0 },
          inputMapping: req.body.inputMapping ?? {},
        })
        .returning();

      res.status(201).json(step);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to add workflow step");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update step
  router.patch("/companies/:companyId/workflows/:id/steps/:stepId", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const stepId = req.params.stepId as string;

      const [existing] = await db
        .select()
        .from(workflowSteps)
        .where(
          and(
            eq(workflowSteps.id, stepId),
            eq(workflowSteps.workflowId, workflowId),
            eq(workflowSteps.companyId, companyId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Step not found" });
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.stepOrder !== undefined) updates.stepOrder = req.body.stepOrder;
      if (req.body.stepType !== undefined) updates.stepType = req.body.stepType;
      if (req.body.agentId !== undefined) updates.agentId = req.body.agentId;
      if (req.body.config !== undefined) updates.config = req.body.config;
      if (req.body.position !== undefined) updates.position = req.body.position;
      if (req.body.inputMapping !== undefined) updates.inputMapping = req.body.inputMapping;

      const [updated] = await db
        .update(workflowSteps)
        .set(updates)
        .where(
          and(
            eq(workflowSteps.id, stepId),
            eq(workflowSteps.workflowId, workflowId),
            eq(workflowSteps.companyId, companyId),
          ),
        )
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to update workflow step");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete step
  router.delete("/companies/:companyId/workflows/:id/steps/:stepId", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const stepId = req.params.stepId as string;

      const [existing] = await db
        .select()
        .from(workflowSteps)
        .where(
          and(
            eq(workflowSteps.id, stepId),
            eq(workflowSteps.workflowId, workflowId),
            eq(workflowSteps.companyId, companyId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Step not found" });
        return;
      }

      await db
        .delete(workflowSteps)
        .where(
          and(
            eq(workflowSteps.id, stepId),
            eq(workflowSteps.workflowId, workflowId),
            eq(workflowSteps.companyId, companyId),
          ),
        );

      res.status(204).end();
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to delete workflow step");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add edge (with DAG cycle validation)
  router.post("/companies/:companyId/workflows/:id/edges", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)));

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const sourceStepId = req.body.sourceStepId as string;
      const targetStepId = req.body.targetStepId as string;

      if (!sourceStepId || !targetStepId) {
        res.status(400).json({ error: "sourceStepId and targetStepId are required" });
        return;
      }

      if (sourceStepId === targetStepId) {
        res.status(400).json({ error: "Self-loops are not allowed" });
        return;
      }

      // Fetch existing edges and check for cycle with the new edge
      const existingEdges = await db
        .select()
        .from(workflowEdges)
        .where(eq(workflowEdges.workflowId, workflowId));

      const candidateEdges = [
        ...existingEdges.map((e) => ({
          sourceStepId: e.sourceStepId,
          targetStepId: e.targetStepId,
        })),
        { sourceStepId, targetStepId },
      ];

      if (hasCycle(candidateEdges)) {
        res.status(400).json({ error: "Adding this edge would create a cycle in the workflow DAG" });
        return;
      }

      const [edge] = await db
        .insert(workflowEdges)
        .values({
          workflowId,
          companyId,
          sourceStepId,
          targetStepId,
          edgeType: req.body.edgeType ?? "default",
          label: req.body.label ?? null,
        })
        .returning();

      res.status(201).json(edge);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to add workflow edge");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete edge
  router.delete("/companies/:companyId/workflows/:id/edges/:edgeId", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const edgeId = req.params.edgeId as string;

      const [existing] = await db
        .select()
        .from(workflowEdges)
        .where(
          and(
            eq(workflowEdges.id, edgeId),
            eq(workflowEdges.workflowId, workflowId),
            eq(workflowEdges.companyId, companyId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Edge not found" });
        return;
      }

      await db
        .delete(workflowEdges)
        .where(
          and(
            eq(workflowEdges.id, edgeId),
            eq(workflowEdges.workflowId, workflowId),
            eq(workflowEdges.companyId, companyId),
          ),
        );

      res.status(204).end();
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to delete workflow edge");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Batch update step positions
  router.put("/companies/:companyId/workflows/:id/layout", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)));

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      // Accept either array format [{stepId, position}] or object map {stepId: {x,y}}
      let positionEntries: Array<{ stepId: string; position: { x: number; y: number } }>;

      if (Array.isArray(req.body.positions)) {
        positionEntries = req.body.positions;
      } else if (req.body.positions && typeof req.body.positions === "object") {
        positionEntries = Object.entries(req.body.positions).map(([stepId, position]) => ({
          stepId,
          position: position as { x: number; y: number },
        }));
      } else {
        res.status(400).json({ error: "positions is required (array or object)" });
        return;
      }

      const updated: unknown[] = [];
      for (const { stepId, position } of positionEntries) {
        const [result] = await db
          .update(workflowSteps)
          .set({ position, updatedAt: new Date() })
          .where(
            and(
              eq(workflowSteps.id, stepId),
              eq(workflowSteps.workflowId, workflowId),
              eq(workflowSteps.companyId, companyId),
            ),
          )
          .returning();
        if (result) updated.push(result);
      }

      res.json({ updated: updated.length });
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to update workflow layout");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Execution
  // ────────────────────────────────────────────────────────────────────────────

  // Start workflow run
  router.post("/companies/:companyId/workflows/:id/run", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)));

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      if (workflow.status === "archived") {
        res.status(400).json({ error: "Cannot run an archived workflow" });
        return;
      }

      const actor = getActorInfo(req);
      const [run] = await db
        .insert(workflowRuns)
        .values({
          workflowId,
          companyId,
          status: "queued",
          triggerType: "manual",
          triggerPayload: req.body.triggerPayload ?? {},
          context: req.body.context ?? {},
          issueId: req.body.issueId ?? null,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          createdByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        })
        .returning();

      // Create step runs for each step in the workflow
      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(asc(workflowSteps.stepOrder));

      for (const step of steps) {
        await db.insert(workflowStepRuns).values({
          workflowRunId: run.id,
          stepId: step.id,
          companyId,
          status: "pending",
        });
      }

      // Fire-and-forget: kick off the engine
      engine.startRun(workflowId, {
        companyId,
        triggerType: "manual",
        triggerPayload: req.body.triggerPayload ?? {},
        issueId: req.body.issueId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : undefined,
        createdByAgentId: actor.actorType === "agent" ? actor.actorId : undefined,
      }).catch((err) => {
        logger.error({ err, runId: run.id }, "Workflow engine startRun failed");
      });

      res.status(201).json(run);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to start workflow run");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // List runs for workflow
  router.get("/companies/:companyId/workflows/:id/runs", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.params.id as string;
      const result = await db
        .select()
        .from(workflowRuns)
        .where(
          and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.companyId, companyId)),
        )
        .orderBy(desc(workflowRuns.createdAt));

      res.json(result);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to list workflow runs");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get run with step runs
  router.get("/companies/:companyId/workflow-runs/:runId", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const runId = req.params.runId as string;
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)));

      if (!run) {
        res.status(404).json({ error: "Workflow run not found" });
        return;
      }

      const rawStepRuns = await db
        .select()
        .from(workflowStepRuns)
        .where(eq(workflowStepRuns.workflowRunId, runId));

      // Join step definitions so frontend can display step names/types
      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, run.workflowId));

      const stepMap = new Map(steps.map(s => [s.id, s]));
      const stepRuns = rawStepRuns.map(sr => ({
        ...sr,
        step: stepMap.get(sr.stepId) ?? null,
      }));

      res.json({ ...run, stepRuns });
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to get workflow run");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel run
  router.post("/companies/:companyId/workflow-runs/:runId/cancel", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const runId = req.params.runId as string;
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)));

      if (!run) {
        res.status(404).json({ error: "Workflow run not found" });
        return;
      }

      if (run.status === "completed" || run.status === "cancelled") {
        res.status(400).json({ error: `Cannot cancel a run with status '${run.status}'` });
        return;
      }

      const [updated] = await db
        .update(workflowRuns)
        .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(workflowRuns.id, runId))
        .returning();

      // Cancel any pending/running step runs
      await db
        .update(workflowStepRuns)
        .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workflowStepRuns.workflowRunId, runId),
            eq(workflowStepRuns.status, "pending"),
          ),
        );

      await db
        .update(workflowStepRuns)
        .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workflowStepRuns.workflowRunId, runId),
            eq(workflowStepRuns.status, "running"),
          ),
        );

      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to cancel workflow run");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Retry run from failure
  router.post("/companies/:companyId/workflow-runs/:runId/retry", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const runId = req.params.runId as string;
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)));

      if (!run) {
        res.status(404).json({ error: "Workflow run not found" });
        return;
      }

      if (run.status !== "failed") {
        res.status(400).json({ error: "Can only retry a failed run" });
        return;
      }

      // Reset failed step runs to pending and increment retry count
      await db
        .update(workflowStepRuns)
        .set({
          status: "pending",
          error: null,
          finishedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStepRuns.workflowRunId, runId),
            eq(workflowStepRuns.status, "failed"),
          ),
        );

      const [updated] = await db
        .update(workflowRuns)
        .set({ status: "queued", error: null, finishedAt: null, updatedAt: new Date() })
        .where(eq(workflowRuns.id, runId))
        .returning();

      // Fire-and-forget: retry from failed step
      engine.retryFromStep(runId).catch((err) => {
        logger.error({ err, runId }, "Workflow engine retry failed");
      });

      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to retry workflow run");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve step run
  router.post(
    "/companies/:companyId/workflow-runs/:runId/steps/:stepRunId/approve",
    async (req, res) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        const runId = req.params.runId as string;
        const stepRunId = req.params.stepRunId as string;

        const [stepRun] = await db
          .select()
          .from(workflowStepRuns)
          .where(
            and(
              eq(workflowStepRuns.id, stepRunId),
              eq(workflowStepRuns.workflowRunId, runId),
              eq(workflowStepRuns.companyId, companyId),
            ),
          );

        if (!stepRun) {
          res.status(404).json({ error: "Step run not found" });
          return;
        }

        if (stepRun.status !== "waiting_approval") {
          res.status(400).json({ error: "Step run is not waiting for approval" });
          return;
        }

        // Use the engine's approveStep which handles status update and DAG advancement
        await engine.approveStep(stepRunId);

        // Re-fetch the updated step run
        const [updated] = await db
          .select()
          .from(workflowStepRuns)
          .where(eq(workflowStepRuns.id, stepRunId));

        res.json(updated);
      } catch (err: unknown) {
        if (err instanceof Error && "statusCode" in err) {
          res.status((err as any).statusCode).json({ error: err.message });
          return;
        }
        logger.error({ err }, "Failed to approve step run");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Reject step run
  router.post(
    "/companies/:companyId/workflow-runs/:runId/steps/:stepRunId/reject",
    async (req, res) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        const runId = req.params.runId as string;
        const stepRunId = req.params.stepRunId as string;

        const [stepRun] = await db
          .select()
          .from(workflowStepRuns)
          .where(
            and(
              eq(workflowStepRuns.id, stepRunId),
              eq(workflowStepRuns.workflowRunId, runId),
              eq(workflowStepRuns.companyId, companyId),
            ),
          );

        if (!stepRun) {
          res.status(404).json({ error: "Step run not found" });
          return;
        }

        if (stepRun.status !== "waiting_approval") {
          res.status(400).json({ error: "Step run is not waiting for approval" });
          return;
        }

        // Use the engine's rejectStep which handles status update and workflow failure
        await engine.rejectStep(stepRunId, req.body.reason);

        // Re-fetch the updated step run
        const [updated] = await db
          .select()
          .from(workflowStepRuns)
          .where(eq(workflowStepRuns.id, stepRunId));

        res.json(updated);
      } catch (err: unknown) {
        if (err instanceof Error && "statusCode" in err) {
          res.status((err as any).statusCode).json({ error: err.message });
          return;
        }
        logger.error({ err }, "Failed to reject step run");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Templates
  // ────────────────────────────────────────────────────────────────────────────

  // List templates
  router.get("/companies/:companyId/workflow-templates", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const result = await db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.companyId, companyId))
        .orderBy(desc(workflowTemplates.usageCount));

      res.json(result);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to list workflow templates");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save workflow as template
  router.post("/companies/:companyId/workflow-templates", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const workflowId = req.body.workflowId as string | undefined;

      let stepsJson: Record<string, unknown>[] = req.body.stepsJson ?? [];
      let edgesJson: Record<string, unknown>[] = req.body.edgesJson ?? [];

      // If workflowId provided, snapshot current steps and edges
      if (workflowId) {
        const steps = await db
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.workflowId, workflowId));
        const edges = await db
          .select()
          .from(workflowEdges)
          .where(eq(workflowEdges.workflowId, workflowId));
        stepsJson = steps.map((s) => ({ ...s })) as unknown as Record<string, unknown>[];
        edgesJson = edges.map((e) => ({ ...e })) as unknown as Record<string, unknown>[];
      }

      const actor = getActorInfo(req);
      const [template] = await db
        .insert(workflowTemplates)
        .values({
          companyId,
          name: req.body.name,
          description: req.body.description ?? null,
          category: req.body.category ?? null,
          stepsJson,
          edgesJson,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        })
        .returning();

      res.status(201).json(template);
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to save workflow template");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Instantiate workflow from template
  router.post("/companies/:companyId/workflow-templates/:id/instantiate", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const templateId = req.params.id as string;
      const [template] = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(eq(workflowTemplates.id, templateId), eq(workflowTemplates.companyId, companyId)),
        );

      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      const actor = getActorInfo(req);

      // Create the workflow
      const [workflow] = await db
        .insert(workflows)
        .values({
          companyId,
          name: req.body.name ?? template.name,
          description: req.body.description ?? template.description,
          status: "draft",
          triggerType: "manual",
          triggerConfig: {},
          templateId,
          metadata: {},
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          createdByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        })
        .returning();

      // Create steps from template, mapping old IDs to new IDs
      const idMap = new Map<string, string>();
      const createdSteps: unknown[] = [];

      for (const stepData of template.stepsJson as Record<string, unknown>[]) {
        const oldId = stepData.id as string;
        const [step] = await db
          .insert(workflowSteps)
          .values({
            workflowId: workflow.id,
            companyId,
            name: (stepData.name as string) ?? "Step",
            description: (stepData.description as string) ?? null,
            stepOrder: (stepData.stepOrder as number) ?? 0,
            stepType: (stepData.stepType as string) ?? "action",
            agentId: (stepData.agentId as string) ?? null,
            config: (stepData.config as Record<string, unknown>) ?? {},
            position: (stepData.position as { x: number; y: number }) ?? { x: 0, y: 0 },
            inputMapping: (stepData.inputMapping as Record<string, unknown>) ?? {},
          })
          .returning();
        idMap.set(oldId, step.id);
        createdSteps.push(step);
      }

      // Create edges with remapped IDs
      const createdEdges: unknown[] = [];
      for (const edgeData of template.edgesJson as Record<string, unknown>[]) {
        const newSourceId = idMap.get(edgeData.sourceStepId as string);
        const newTargetId = idMap.get(edgeData.targetStepId as string);
        if (!newSourceId || !newTargetId) continue;

        const [edge] = await db
          .insert(workflowEdges)
          .values({
            workflowId: workflow.id,
            companyId,
            sourceStepId: newSourceId,
            targetStepId: newTargetId,
            edgeType: (edgeData.edgeType as string) ?? "default",
            label: (edgeData.label as string) ?? null,
          })
          .returning();
        createdEdges.push(edge);
      }

      // Increment usage count
      await db
        .update(workflowTemplates)
        .set({ usageCount: template.usageCount + 1, updatedAt: new Date() })
        .where(eq(workflowTemplates.id, templateId));

      res.status(201).json({ ...workflow, steps: createdSteps, edges: createdEdges });
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to instantiate workflow from template");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Generate workflow from description
  router.post("/companies/:companyId/workflows/generate", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { description, issueId } = req.body;
      if (!description) {
        res.status(400).json({ error: "description is required" });
        return;
      }

      const { workflowGenerator } = await import("../services/workflow-generator.js");
      const generator = workflowGenerator(db);
      const actor = getActorInfo(req);

      const result = await generator.generate({
        companyId,
        description,
        issueId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : undefined,
      });

      // Fetch the created workflow with steps/edges
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, result.workflowId));

      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, result.workflowId))
        .orderBy(asc(workflowSteps.stepOrder));

      const edges = await db
        .select()
        .from(workflowEdges)
        .where(eq(workflowEdges.workflowId, result.workflowId));

      res.status(201).json({ ...workflow, steps, edges });
    } catch (err: unknown) {
      if (err instanceof Error && "statusCode" in err) {
        res.status((err as any).statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "Failed to generate workflow");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
