import { and, eq, inArray, sql, desc, asc, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  workflows,
  workflowSteps,
  workflowEdges,
  workflowRuns,
  workflowStepRuns,
  workflowTemplates,
  heartbeatRuns,
  agents,
  agentWakeupRequests,
  companySkills,
} from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";
import { logger } from "../middleware/logger.js";

export function workflowEngine(db: Db) {

  // ---- DAG Validation ----
  function validateDAG(steps: Array<{ id: string }>, edges: Array<{ sourceStepId: string; targetStepId: string }>) {
    // Kahn's algorithm for topological sort — detect cycles
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const step of steps) {
      adjList.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    for (const edge of edges) {
      adjList.get(edge.sourceStepId)?.push(edge.targetStepId);
      inDegree.set(edge.targetStepId, (inDegree.get(edge.targetStepId) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let sorted = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted++;
      for (const neighbor of adjList.get(node) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (sorted !== steps.length) {
      throw new Error("Workflow contains a cycle — cannot execute");
    }

    // Check for entry points
    const hasEntry = steps.some(s => {
      const degree = edges.filter(e => e.targetStepId === s.id).length;
      return degree === 0;
    });
    if (!hasEntry && steps.length > 0) {
      throw new Error("Workflow has no entry steps (all steps have incoming edges)");
    }
  }

  // ---- Find entry steps (no incoming edges) ----
  function findEntryStepIds(
    steps: Array<{ id: string }>,
    edges: Array<{ targetStepId: string }>,
  ): string[] {
    const hasIncoming = new Set(edges.map(e => e.targetStepId));
    return steps.filter(s => !hasIncoming.has(s.id)).map(s => s.id);
  }

  // ---- Find terminal steps (no outgoing edges) ----
  function findTerminalStepIds(
    steps: Array<{ id: string }>,
    edges: Array<{ sourceStepId: string }>,
  ): string[] {
    const hasOutgoing = new Set(edges.map(e => e.sourceStepId));
    return steps.filter(s => !hasOutgoing.has(s.id)).map(s => s.id);
  }

  // ---- Start a new workflow run ----
  async function startRun(workflowId: string, opts: {
    companyId: string;
    triggerType: string;
    triggerPayload?: Record<string, unknown>;
    issueId?: string;
    createdByUserId?: string;
    createdByAgentId?: string;
    parentRunId?: string;
  }) {
    // Load workflow definition
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
    });
    if (!workflow) throw new Error("Workflow not found");
    if (workflow.status !== "active") throw new Error("Workflow is not active");

    const steps = await db.query.workflowSteps.findMany({
      where: eq(workflowSteps.workflowId, workflowId),
      orderBy: asc(workflowSteps.stepOrder),
    });
    const edges = await db.query.workflowEdges.findMany({
      where: eq(workflowEdges.workflowId, workflowId),
    });

    if (steps.length === 0) throw new Error("Workflow has no steps");
    validateDAG(steps, edges);

    // Create the run
    const [run] = await db.insert(workflowRuns).values({
      workflowId,
      companyId: opts.companyId,
      status: "running",
      triggerType: opts.triggerType,
      triggerPayload: opts.triggerPayload ?? {},
      context: { ...(opts.triggerPayload ?? {}) },
      issueId: opts.issueId ?? null,
      parentRunId: opts.parentRunId ?? null,
      startedAt: new Date(),
      createdByUserId: opts.createdByUserId ?? null,
      createdByAgentId: opts.createdByAgentId ?? null,
    }).returning();

    // Create step runs for ALL steps
    const stepRunValues = steps.map(s => ({
      workflowRunId: run.id,
      stepId: s.id,
      companyId: opts.companyId,
      status: "pending" as const,
      retryCount: 0,
    }));
    await db.insert(workflowStepRuns).values(stepRunValues);

    // Queue entry steps
    const entryIds = findEntryStepIds(steps, edges);
    for (const stepId of entryIds) {
      await queueStep(run.id, stepId, {});
    }

    publishLiveEvent({
      companyId: opts.companyId,
      type: "workflow.run.started",
      payload: {
        runId: run.id,
        workflowId,
        workflowName: workflow.name,
        issueId: opts.issueId ?? null,
      },
    });

    logger.info({ workflowId, runId: run.id }, "workflow run started");
    return run;
  }

  // ---- Queue a step for execution ----
  async function queueStep(workflowRunId: string, stepId: string, context: Record<string, unknown>) {
    // Update step run status to queued
    await db.update(workflowStepRuns)
      .set({ status: "queued", input: context, updatedAt: new Date() })
      .where(and(
        eq(workflowStepRuns.workflowRunId, workflowRunId),
        eq(workflowStepRuns.stepId, stepId),
      ));

    // Load the step definition
    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepId),
    });
    if (!step) return;

    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: and(
        eq(workflowStepRuns.workflowRunId, workflowRunId),
        eq(workflowStepRuns.stepId, stepId),
      ),
    });
    if (!stepRun) return;

    // Load the workflow run for context
    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });
    if (!run) return;

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.step.status",
      payload: { workflowRunId, stepRunId: stepRun.id, stepId, status: "queued", stepName: step.name },
    });

    // Execute based on step type
    await executeStep(run, step, stepRun);
  }

  // ---- Execute a step based on its type ----
  async function executeStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
  ) {
    // Mark as running
    await db.update(workflowStepRuns)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRun.id));

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.step.status",
      payload: {
        workflowRunId: run.id, stepRunId: stepRun.id, stepId: step.id,
        status: "running", stepName: step.name,
      },
    });

    const config = (step.config ?? {}) as Record<string, unknown>;

    try {
      switch (step.stepType) {
        case "agent_run":
          await executeAgentRunStep(run, step, stepRun, config);
          break;
        case "condition":
          await executeConditionStep(run, step, stepRun, config);
          break;
        case "parallel_gate":
          await executeParallelGateStep(run, step, stepRun, config);
          break;
        case "approval":
          await executeApprovalStep(run, step, stepRun, config);
          break;
        case "transform":
          await executeTransformStep(run, step, stepRun, config);
          break;
        case "webhook":
          await executeWebhookStep(run, step, stepRun, config);
          break;
        case "sub_workflow":
          await executeSubWorkflowStep(run, step, stepRun, config);
          break;
        default:
          throw new Error(`Unknown step type: ${step.stepType}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step execution failed";
      await failStep(stepRun.id, run.id, message);
    }
  }

  // ---- Agent Run Step: enqueue a wakeup ----
  async function executeAgentRunStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    let agentId = step.agentId;
    let agent: typeof agents.$inferSelect | null = null;

    if (agentId) {
      agent = (await db.query.agents.findFirst({ where: eq(agents.id, agentId) })) ?? null;
      if (!agent) throw new Error(`Agent ${agentId} not found`);
    }

    // Auto-create a dedicated agent for this workflow step if none assigned
    if (!agent) {
      const workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, run.workflowId) });
      const workflowName = workflow?.name ?? "Workflow";
      const agentName = `${step.name} (${workflowName})`;
      const defaultAdapter = process.env.PAPERCLIP_DEFAULT_ADAPTER_TYPE || "cursor";

      const [created] = await db.insert(agents).values({
        companyId: run.companyId,
        name: agentName,
        role: "general",
        title: `Auto-created for workflow step: ${step.name}`,
        icon: "zap",
        status: "idle",
        adapterType: defaultAdapter,
        adapterConfig: config.model ? { model: config.model } : {},
        metadata: {
          createdForWorkflow: run.workflowId,
          createdForStep: step.id,
          autoCreated: true,
        },
      }).returning();

      agent = created;
      agentId = created.id;

      // Persist the agent assignment on the step so future runs reuse it
      await db.update(workflowSteps)
        .set({ agentId: created.id, updatedAt: new Date() })
        .where(eq(workflowSteps.id, step.id));

      logger.info(
        { stepId: step.id, agentId: created.id, agentName },
        "workflow: auto-created agent for step",
      );
    }

    // Build the wakeup payload with workflow context
    const runContext = (run.context ?? {}) as Record<string, unknown>;
    const stepInput = (stepRun.input ?? {}) as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      workflowRunId: run.id,
      stepRunId: stepRun.id,
      workflowContext: runContext,
      stepInput,
      contextSnapshot: {
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        stepName: step.name,
      },
    };
    if (config.promptTemplate) payload.stepInstructions = config.promptTemplate;
    if (config.model) payload.adapterOverrides = { model: config.model };

    // Skill injection
    if (config.skillName) {
      const [skill] = await db.select().from(companySkills)
        .where(and(
          eq(companySkills.name, config.skillName as string),
          eq(companySkills.companyId, run.companyId)
        ));
      if (skill) {
        const existing = (payload.stepInstructions as string) ?? "";
        payload.stepInstructions = `<skill name="${skill.name}">\n${skill.content}\n</skill>\n\n${existing}`;
        if (config.skillFiles && skill.files && Object.keys(skill.files).length > 0) {
          payload.skillFiles = skill.files;
        }
      } else {
        logger.warn({ skillName: config.skillName }, "workflow: skill not found, continuing without");
      }
    }

    // Create wakeup request + heartbeat_run so the runner can pick it up
    const contextSnapshot = {
      workflowRunId: run.id,
      stepRunId: stepRun.id,
      stepName: step.name,
      ...(payload.stepInstructions ? { stepInstructions: payload.stepInstructions } : {}),
      ...(payload.workflowContext ? { workflowContext: payload.workflowContext } : {}),
      ...(payload.stepInput ? { stepInput: payload.stepInput } : {}),
      ...(payload.adapterOverrides ? { adapterOverrides: payload.adapterOverrides } : {}),
      ...(payload.skillFiles ? { skillFiles: payload.skillFiles } : {}),
    };

    const [wakeup] = await db.insert(agentWakeupRequests).values({
      companyId: run.companyId,
      agentId: agentId!,
      source: "automation",
      triggerDetail: "system",
      reason: `Workflow step: ${step.name}`,
      status: "queued",
      payload,
      requestedByActorType: "system",
    }).returning();

    // Create the heartbeat_run that the runner actually polls for
    const [hbRun] = await db.insert(heartbeatRuns).values({
      companyId: run.companyId,
      agentId: agentId!,
      invocationSource: "automation",
      triggerDetail: "system",
      status: "queued",
      wakeupRequestId: wakeup.id,
      contextSnapshot,
    }).returning();

    // Link wakeup → heartbeat run
    await db.update(agentWakeupRequests)
      .set({ runId: hbRun.id, updatedAt: new Date() })
      .where(eq(agentWakeupRequests.id, wakeup.id));

    // Link step run → heartbeat run
    await db.update(workflowStepRuns)
      .set({ heartbeatRunId: hbRun.id, updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRun.id));

    publishLiveEvent({
      companyId: run.companyId,
      type: "heartbeat.run.queued",
      agentId: agentId!,
      runId: hbRun.id,
    });

    logger.info({ stepRunId: stepRun.id, agentId, wakeupId: wakeup.id, heartbeatRunId: hbRun.id }, "workflow: agent_run step enqueued with heartbeat_run");
  }

  // ---- Condition Step: evaluate and route ----
  async function executeConditionStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const runContext = (run.context ?? {}) as Record<string, unknown>;
    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value;

    // Resolve field from context (supports dot notation)
    let fieldValue: unknown = runContext;
    if (field) {
      for (const key of field.split(".")) {
        if (fieldValue && typeof fieldValue === "object") {
          fieldValue = (fieldValue as Record<string, unknown>)[key];
        } else {
          fieldValue = undefined;
          break;
        }
      }
    }

    let result = false;
    switch (operator) {
      case "eq": result = fieldValue === value; break;
      case "neq": result = fieldValue !== value; break;
      case "contains": result = typeof fieldValue === "string" && typeof value === "string" && fieldValue.includes(value); break;
      case "gt": result = typeof fieldValue === "number" && typeof value === "number" && fieldValue > value; break;
      case "lt": result = typeof fieldValue === "number" && typeof value === "number" && fieldValue < value; break;
      case "exists": result = fieldValue !== undefined && fieldValue !== null; break;
      case "not_exists": result = fieldValue === undefined || fieldValue === null; break;
      default: result = false;
    }

    const output = { conditionResult: result, field, operator, fieldValue, expectedValue: value };
    await completeStep(stepRun.id, run.id, output, result ? "condition_true" : "condition_false");
  }

  // ---- Parallel Gate Step: wait for all predecessors ----
  async function executeParallelGateStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const waitFor = (config.waitFor as string) ?? "all";

    // Find all incoming edges to this step
    const incomingEdges = await db.query.workflowEdges.findMany({
      where: and(
        eq(workflowEdges.workflowId, run.workflowId),
        eq(workflowEdges.targetStepId, step.id),
      ),
    });

    const predecessorStepIds = incomingEdges.map(e => e.sourceStepId);

    if (predecessorStepIds.length === 0) {
      await completeStep(stepRun.id, run.id, { message: "No predecessors" });
      return;
    }

    // Check predecessor step run statuses
    const predecessorRuns = await db.query.workflowStepRuns.findMany({
      where: and(
        eq(workflowStepRuns.workflowRunId, run.id),
        inArray(workflowStepRuns.stepId, predecessorStepIds),
      ),
    });

    const allDone = predecessorRuns.every(r => r.status === "succeeded" || r.status === "failed" || r.status === "skipped");
    const anyDone = predecessorRuns.some(r => r.status === "succeeded");
    const anyFailed = predecessorRuns.some(r => r.status === "failed");

    if (waitFor === "all" && !allDone) {
      // Not ready yet — revert to pending, will be re-checked
      await db.update(workflowStepRuns)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(workflowStepRuns.id, stepRun.id));
      return;
    }

    if (waitFor === "any" && !anyDone && !allDone) {
      await db.update(workflowStepRuns)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(workflowStepRuns.id, stepRun.id));
      return;
    }

    if (anyFailed && waitFor === "all") {
      await failStep(stepRun.id, run.id, "One or more predecessor steps failed");
      return;
    }

    // Merge predecessor outputs
    const mergedOutput: Record<string, unknown> = {};
    for (const pr of predecessorRuns) {
      if (pr.output) {
        Object.assign(mergedOutput, pr.output as Record<string, unknown>);
      }
    }

    await completeStep(stepRun.id, run.id, mergedOutput);
  }

  // ---- Approval Step: pause and wait ----
  async function executeApprovalStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const message = (config.message as string) ?? "Approval required";

    await db.update(workflowStepRuns)
      .set({ status: "waiting_approval", updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRun.id));

    // Pause the workflow run
    await db.update(workflowRuns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.approval.required",
      payload: {
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        stepName: step.name,
        message,
        context: run.context,
      },
    });

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.run.status",
      payload: { runId: run.id, status: "paused", reason: `Approval required: ${step.name}` },
    });
  }

  // ---- Transform Step: reshape data ----
  async function executeTransformStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const mapping = (config.mapping ?? {}) as Record<string, string>;
    const runContext = (run.context ?? {}) as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [outputKey, sourcePath] of Object.entries(mapping)) {
      let value: unknown = runContext;
      for (const key of sourcePath.split(".")) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[key];
        } else {
          value = undefined;
          break;
        }
      }
      output[outputKey] = value;
    }

    await completeStep(stepRun.id, run.id, output);
  }

  // ---- Webhook Step: HTTP call ----
  async function executeWebhookStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const url = config.url as string;
    if (!url) throw new Error("Webhook step missing url");

    const method = (config.method as string) ?? "POST";
    const headers = (config.headers ?? {}) as Record<string, string>;
    const bodyTemplate = config.bodyTemplate as Record<string, unknown> | undefined;
    const timeoutMs = (config.timeoutMs as number) ?? 30_000;

    const body = bodyTemplate
      ? JSON.stringify({ ...bodyTemplate, workflowContext: run.context })
      : JSON.stringify({ workflowRunId: run.id, context: run.context });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: method !== "GET" ? body : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseBody = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(responseBody); } catch { parsed = responseBody; }

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${responseBody.slice(0, 500)}`);
      }

      await completeStep(stepRun.id, run.id, {
        statusCode: response.status,
        response: parsed,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // ---- Sub-Workflow Step: start child workflow ----
  async function executeSubWorkflowStep(
    run: typeof workflowRuns.$inferSelect,
    step: typeof workflowSteps.$inferSelect,
    stepRun: typeof workflowStepRuns.$inferSelect,
    config: Record<string, unknown>,
  ) {
    const childWorkflowId = config.workflowId as string;
    if (!childWorkflowId) throw new Error("sub_workflow step missing workflowId");

    // Start child workflow with parent link
    const childRun = await startRun(childWorkflowId, {
      companyId: run.companyId,
      triggerType: "manual",
      triggerPayload: { parentRunId: run.id, parentStepRunId: stepRun.id },
      parentRunId: run.id,
    });

    // Update step run with child run reference
    await db.update(workflowStepRuns)
      .set({ output: { childRunId: childRun.id } as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRun.id));

    // The sub_workflow step stays "running" until the child workflow completes
    // onChildWorkflowCompleted will handle advancing
  }

  // ---- Complete a step and advance DAG ----
  async function completeStep(
    stepRunId: string,
    workflowRunId: string,
    output: Record<string, unknown>,
    edgeFilter?: string,
  ) {
    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: eq(workflowStepRuns.id, stepRunId),
    });
    if (!stepRun) return;

    // Update step run
    await db.update(workflowStepRuns)
      .set({
        status: "succeeded",
        output: output as Record<string, unknown>,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowStepRuns.id, stepRunId));

    // Merge output into workflow run context
    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });
    if (!run) return;

    const currentContext = (run.context ?? {}) as Record<string, unknown>;
    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepRun.stepId),
    });
    const stepKey = step?.name?.replace(/\s+/g, "_").toLowerCase() ?? stepRun.stepId;
    const newContext = { ...currentContext, [stepKey]: output };

    await db.update(workflowRuns)
      .set({ context: newContext as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.step.status",
      payload: {
        workflowRunId, stepRunId, stepId: stepRun.stepId,
        status: "succeeded", stepName: step?.name ?? "unknown",
      },
    });

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.step.output",
      payload: { workflowRunId, stepRunId, stepId: stepRun.stepId, output },
    });

    // Find outgoing edges
    let outgoingEdges = await db.query.workflowEdges.findMany({
      where: and(
        eq(workflowEdges.workflowId, run.workflowId),
        eq(workflowEdges.sourceStepId, stepRun.stepId),
      ),
    });

    // Filter edges based on condition result
    if (edgeFilter) {
      outgoingEdges = outgoingEdges.filter(e => e.edgeType === edgeFilter);
    }

    // Skip steps that weren't routed to (for condition steps)
    if (edgeFilter) {
      const skippedEdgeType = edgeFilter === "condition_true" ? "condition_false" : "condition_true";
      const skippedEdges = await db.query.workflowEdges.findMany({
        where: and(
          eq(workflowEdges.workflowId, run.workflowId),
          eq(workflowEdges.sourceStepId, stepRun.stepId),
          eq(workflowEdges.edgeType, skippedEdgeType),
        ),
      });
      for (const se of skippedEdges) {
        await skipStepAndDescendants(workflowRunId, se.targetStepId, run.workflowId);
      }
    }

    // Queue next steps
    for (const edge of outgoingEdges) {
      // Check if next step is a parallel_gate — if so, check all predecessors
      const nextStep = await db.query.workflowSteps.findFirst({
        where: eq(workflowSteps.id, edge.targetStepId),
      });

      if (nextStep?.stepType === "parallel_gate") {
        // Re-check if all predecessors are done
        const allIncoming = await db.query.workflowEdges.findMany({
          where: and(
            eq(workflowEdges.workflowId, run.workflowId),
            eq(workflowEdges.targetStepId, edge.targetStepId),
          ),
        });
        const predStepIds = allIncoming.map(e => e.sourceStepId);
        const predRuns = await db.query.workflowStepRuns.findMany({
          where: and(
            eq(workflowStepRuns.workflowRunId, workflowRunId),
            inArray(workflowStepRuns.stepId, predStepIds),
          ),
        });
        const allPredDone = predRuns.every(r =>
          r.status === "succeeded" || r.status === "failed" || r.status === "skipped"
        );
        if (!allPredDone) continue; // Don't queue yet
      }

      await queueStep(workflowRunId, edge.targetStepId, newContext);
    }

    // Check if workflow is complete
    await checkWorkflowCompletion(workflowRunId);
  }

  // ---- Skip a step and its descendants ----
  async function skipStepAndDescendants(workflowRunId: string, stepId: string, workflowId: string) {
    await db.update(workflowStepRuns)
      .set({ status: "skipped", finishedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(workflowStepRuns.workflowRunId, workflowRunId),
        eq(workflowStepRuns.stepId, stepId),
      ));

    // Find and skip descendants (only if they have no other non-skipped predecessors)
    const outgoing = await db.query.workflowEdges.findMany({
      where: and(
        eq(workflowEdges.workflowId, workflowId),
        eq(workflowEdges.sourceStepId, stepId),
      ),
    });

    for (const edge of outgoing) {
      // Check if target has other non-skipped incoming paths
      const allIncoming = await db.query.workflowEdges.findMany({
        where: and(
          eq(workflowEdges.workflowId, workflowId),
          eq(workflowEdges.targetStepId, edge.targetStepId),
        ),
      });

      const otherPredRuns = await db.query.workflowStepRuns.findMany({
        where: and(
          eq(workflowStepRuns.workflowRunId, workflowRunId),
          inArray(workflowStepRuns.stepId, allIncoming.map(e => e.sourceStepId).filter(id => id !== stepId)),
        ),
      });

      const allOtherSkipped = otherPredRuns.length === 0 || otherPredRuns.every(r => r.status === "skipped");
      if (allOtherSkipped) {
        await skipStepAndDescendants(workflowRunId, edge.targetStepId, workflowId);
      }
    }
  }

  // ---- Fail a step ----
  async function failStep(stepRunId: string, workflowRunId: string, error: string) {
    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: eq(workflowStepRuns.id, stepRunId),
    });
    if (!stepRun) return;

    const config = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepRun.stepId),
    });
    const stepConfig = (config?.config ?? {}) as Record<string, unknown>;
    const retryPolicy = stepConfig.retryPolicy as { maxRetries?: number; backoffSec?: number } | undefined;

    if (retryPolicy && stepRun.retryCount < (retryPolicy.maxRetries ?? 0)) {
      // Retry with backoff
      const backoffMs = (retryPolicy.backoffSec ?? 5) * 1000 * Math.pow(2, stepRun.retryCount);
      await db.update(workflowStepRuns)
        .set({
          status: "queued",
          retryCount: stepRun.retryCount + 1,
          error,
          updatedAt: new Date(),
        })
        .where(eq(workflowStepRuns.id, stepRunId));

      logger.info({ stepRunId, retryCount: stepRun.retryCount + 1, backoffMs }, "workflow: retrying step");

      // Schedule retry after backoff
      setTimeout(async () => {
        try {
          const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, workflowRunId) });
          if (run && run.status === "running") {
            await queueStep(workflowRunId, stepRun.stepId, (run.context ?? {}) as Record<string, unknown>);
          }
        } catch (err) {
          logger.error({ err, stepRunId }, "workflow: retry failed");
        }
      }, backoffMs);
      return;
    }

    // No retries left — fail
    await db.update(workflowStepRuns)
      .set({ status: "failed", error, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRunId));

    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });
    if (run) {
      publishLiveEvent({
        companyId: run.companyId,
        type: "workflow.step.status",
        payload: { workflowRunId, stepRunId, stepId: stepRun.stepId, status: "failed", error },
      });
    }

    // Fail the workflow
    await db.update(workflowRuns)
      .set({ status: "failed", error: `Step failed: ${error}`, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));

    if (run) {
      publishLiveEvent({
        companyId: run.companyId,
        type: "workflow.run.status",
        payload: { runId: workflowRunId, status: "failed", error: `Step failed: ${error}` },
      });
    }
  }

  // ---- Check if workflow is complete ----
  async function checkWorkflowCompletion(workflowRunId: string) {
    const allStepRuns = await db.query.workflowStepRuns.findMany({
      where: eq(workflowStepRuns.workflowRunId, workflowRunId),
    });

    const allTerminal = allStepRuns.every(sr =>
      sr.status === "succeeded" || sr.status === "failed" || sr.status === "skipped" || sr.status === "cancelled"
    );

    if (!allTerminal) return;

    const anyFailed = allStepRuns.some(sr => sr.status === "failed");
    const status = anyFailed ? "failed" : "succeeded";

    await db.update(workflowRuns)
      .set({ status, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));

    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });

    if (run) {
      publishLiveEvent({
        companyId: run.companyId,
        type: "workflow.run.status",
        payload: { runId: workflowRunId, status },
      });

      // If this is a sub-workflow, complete the parent step
      if (run.parentRunId) {
        const parentStepRun = await db.query.workflowStepRuns.findFirst({
          where: and(
            eq(workflowStepRuns.workflowRunId, run.parentRunId),
            eq(workflowStepRuns.status, "running"),
          ),
        });
        if (parentStepRun) {
          if (status === "succeeded") {
            await completeStep(parentStepRun.id, run.parentRunId, run.context as Record<string, unknown>);
          } else {
            await failStep(parentStepRun.id, run.parentRunId, run.error ?? "Sub-workflow failed");
          }
        }
      }
    }
  }

  // ---- Called when a heartbeat_run completes (hook from heartbeat.ts) ----
  async function onHeartbeatRunCompleted(heartbeatRunId: string) {
    // Find step_run linked to this heartbeat_run
    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: eq(workflowStepRuns.heartbeatRunId, heartbeatRunId),
    });
    if (!stepRun) return; // not a workflow-triggered run

    const hbRun = await db.query.heartbeatRuns.findFirst({
      where: eq(heartbeatRuns.id, heartbeatRunId),
    });
    if (!hbRun) return;

    const resultData = (hbRun.resultJson ?? {}) as Record<string, unknown>;
    const output: Record<string, unknown> = {
      status: hbRun.status,
      summary: resultData.summary ?? null,
      resultJson: hbRun.resultJson,
      stdoutExcerpt: hbRun.stdoutExcerpt,
      usage: hbRun.usageJson,
    };

    if (hbRun.status === "succeeded") {
      await completeStep(stepRun.id, stepRun.workflowRunId, output);
    } else {
      const error = hbRun.error ?? `Agent run ${hbRun.status}`;
      await failStep(stepRun.id, stepRun.workflowRunId, error);
    }
  }

  // ---- Link heartbeat run to workflow step run ----
  async function linkHeartbeatRunToStep(heartbeatRunId: string, contextSnapshot: Record<string, unknown> | null) {
    if (!contextSnapshot?.stepRunId) return;
    const stepRunId = contextSnapshot.stepRunId as string;

    await db.update(workflowStepRuns)
      .set({ heartbeatRunId: heartbeatRunId, updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, stepRunId));
  }

  // ---- Cancel a workflow run ----
  async function cancelRun(workflowRunId: string) {
    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });
    if (!run) throw new Error("Workflow run not found");
    if (run.status !== "running" && run.status !== "paused") {
      throw new Error(`Cannot cancel workflow in status: ${run.status}`);
    }

    // Cancel all non-terminal step runs
    await db.update(workflowStepRuns)
      .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(workflowStepRuns.workflowRunId, workflowRunId),
        inArray(workflowStepRuns.status, ["pending", "queued", "running", "waiting_approval"]),
      ));

    await db.update(workflowRuns)
      .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.run.status",
      payload: { runId: workflowRunId, status: "cancelled" },
    });
  }

  // ---- Approve an approval step ----
  async function approveStep(stepRunId: string) {
    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: eq(workflowStepRuns.id, stepRunId),
    });
    if (!stepRun) throw new Error("Step run not found");
    if (stepRun.status !== "waiting_approval") {
      throw new Error(`Step is not waiting for approval (status: ${stepRun.status})`);
    }

    // Resume workflow
    await db.update(workflowRuns)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(workflowRuns.id, stepRun.workflowRunId));

    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, stepRun.workflowRunId),
    });

    if (run) {
      publishLiveEvent({
        companyId: run.companyId,
        type: "workflow.run.status",
        payload: { runId: run.id, status: "running" },
      });
    }

    await completeStep(stepRunId, stepRun.workflowRunId, { approved: true });
  }

  // ---- Reject an approval step ----
  async function rejectStep(stepRunId: string, reason?: string) {
    const stepRun = await db.query.workflowStepRuns.findFirst({
      where: eq(workflowStepRuns.id, stepRunId),
    });
    if (!stepRun) throw new Error("Step run not found");
    if (stepRun.status !== "waiting_approval") {
      throw new Error(`Step is not waiting for approval (status: ${stepRun.status})`);
    }

    await failStep(stepRunId, stepRun.workflowRunId, reason ?? "Approval rejected");
  }

  // ---- Retry from failed step ----
  async function retryFromStep(workflowRunId: string) {
    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, workflowRunId),
    });
    if (!run) throw new Error("Workflow run not found");
    if (run.status !== "failed") throw new Error("Can only retry failed workflows");

    // Find the failed step
    const failedStep = await db.query.workflowStepRuns.findFirst({
      where: and(
        eq(workflowStepRuns.workflowRunId, workflowRunId),
        eq(workflowStepRuns.status, "failed"),
      ),
    });
    if (!failedStep) throw new Error("No failed step found");

    // Reset the failed step and re-run
    await db.update(workflowRuns)
      .set({ status: "running", error: null, finishedAt: null, updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));

    await db.update(workflowStepRuns)
      .set({ status: "queued", error: null, finishedAt: null, updatedAt: new Date() })
      .where(eq(workflowStepRuns.id, failedStep.id));

    publishLiveEvent({
      companyId: run.companyId,
      type: "workflow.run.status",
      payload: { runId: workflowRunId, status: "running" },
    });

    await queueStep(workflowRunId, failedStep.stepId, (run.context ?? {}) as Record<string, unknown>);
    return run;
  }

  // ---- Recover in-flight runs after server restart ----
  async function recoverInFlightRuns() {
    const runningRuns = await db.query.workflowRuns.findMany({
      where: eq(workflowRuns.status, "running"),
    });

    for (const run of runningRuns) {
      const runningSteps = await db.query.workflowStepRuns.findMany({
        where: and(
          eq(workflowStepRuns.workflowRunId, run.id),
          eq(workflowStepRuns.status, "running"),
        ),
      });

      for (const stepRun of runningSteps) {
        if (stepRun.heartbeatRunId) {
          // Check if heartbeat run has completed
          const hbRun = await db.query.heartbeatRuns.findFirst({
            where: eq(heartbeatRuns.id, stepRun.heartbeatRunId),
          });
          if (hbRun && (hbRun.status === "succeeded" || hbRun.status === "failed" || hbRun.status === "timed_out")) {
            await onHeartbeatRunCompleted(stepRun.heartbeatRunId);
          }
        }
      }

      // Also check completion in case all steps finished while server was down
      await checkWorkflowCompletion(run.id);
    }

    logger.info({ count: runningRuns.length }, "workflow: recovered in-flight runs");
  }

  return {
    validateDAG,
    startRun,
    cancelRun,
    approveStep,
    rejectStep,
    retryFromStep,
    onHeartbeatRunCompleted,
    linkHeartbeatRunToStep,
    recoverInFlightRuns,
    checkWorkflowCompletion,
  };
}
