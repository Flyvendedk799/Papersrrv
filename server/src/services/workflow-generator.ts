import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, workflows, workflowSteps, workflowEdges } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface GenerateWorkflowInput {
  companyId: string;
  description: string;
  issueId?: string;
  createdByUserId?: string;
}

interface GeneratedStep {
  tempId: string;
  name: string;
  stepType: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  promptTemplate?: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

interface GeneratedEdge {
  from: string;
  to: string;
  edgeType?: string;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  steps: GeneratedStep[];
  edges: GeneratedEdge[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export function workflowGenerator(db: Db) {

  /** Load available agents for a company */
  async function loadAgents(companyId: string) {
    return db.query.agents.findMany({
      where: eq(agents.companyId, companyId),
    });
  }

  /** Generate a workflow from a task description */
  async function generate(input: GenerateWorkflowInput): Promise<{ workflowId: string }> {
    const availableAgents = await loadAgents(input.companyId);

    if (availableAgents.length === 0) {
      throw new Error("No agents available to create a workflow");
    }

    // Build the workflow using rule-based heuristics.
    // LLM-based generation can replace this once Claude API keys are wired
    // through the adapter system — see `generateWithLLM` below.
    const generated = buildWorkflowFromDescription(input.description, availableAgents);

    // Persist the workflow in draft status so users can review before activating
    const [workflow] = await db.insert(workflows).values({
      companyId: input.companyId,
      name: generated.name,
      description: generated.description,
      status: "draft",
      triggerType: input.issueId ? "from_issue" : "generated",
      triggerConfig: input.issueId ? { sourceIssueId: input.issueId } : {},
      createdByUserId: input.createdByUserId ?? null,
    }).returning();

    // Create steps, keeping a mapping from temp IDs to real UUIDs
    const stepIdMap = new Map<string, string>();
    for (const step of generated.steps) {
      const [created] = await db.insert(workflowSteps).values({
        workflowId: workflow.id,
        companyId: input.companyId,
        name: step.name,
        stepType: step.stepType,
        agentId: step.agentId ?? null,
        config: step.config,
        position: step.position,
        stepOrder: generated.steps.indexOf(step),
      }).returning();
      stepIdMap.set(step.tempId, created.id);
    }

    // Create edges between steps
    for (const edge of generated.edges) {
      const sourceId = stepIdMap.get(edge.from);
      const targetId = stepIdMap.get(edge.to);
      if (sourceId && targetId) {
        await db.insert(workflowEdges).values({
          workflowId: workflow.id,
          companyId: input.companyId,
          sourceStepId: sourceId,
          targetStepId: targetId,
          edgeType: edge.edgeType ?? "default",
        });
      }
    }

    logger.info({ workflowId: workflow.id, steps: generated.steps.length }, "workflow generated from description");
    return { workflowId: workflow.id };
  }

  // ── Rule-based workflow builder ──────────────────────────────────────────

  /**
   * Analyses the task description with keyword heuristics and maps it to one of
   * several workflow templates (code, research, content, generic). Each template
   * selects agents by role and wires up a sensible step sequence.
   */
  function buildWorkflowFromDescription(
    description: string,
    availableAgents: Array<{ id: string; name: string; role: string; adapterType: string }>,
  ): GeneratedWorkflow {
    const lower = description.toLowerCase();

    // Helper: find the first agent whose role matches one of the given roles
    const findAgent = (roles: string[]) =>
      availableAgents.find(a => roles.includes(a.role)) ?? availableAgents[0];

    const ceo = findAgent(["ceo"]);
    const engineer = findAgent(["engineer", "cto", "devops"]);
    const qa = findAgent(["qa", "engineer"]);
    const pm = findAgent(["pm", "ceo"]);

    // Classify the task
    const isCodeTask = /(?:build|implement|code|develop|create|fix|bug|feature|refactor|deploy)/i.test(lower);
    const isResearchTask = /(?:research|analyze|investigate|study|explore|review|audit)/i.test(lower);
    const isContentTask = /(?:write|draft|document|blog|content|article|report)/i.test(lower);

    const steps: GeneratedStep[] = [];
    const edges: GeneratedEdge[] = [];
    let y = 0;
    const X_CENTER = 200;
    const Y_STEP = 120;

    // Every workflow starts with a planning step
    steps.push({
      tempId: "plan",
      name: "Plan & Decompose",
      stepType: "agent_run",
      agentId: ceo?.id,
      agentName: ceo?.name,
      model: "claude-opus-4-6",
      promptTemplate: `Analyze the following task and create a detailed plan:\n\n${description}`,
      config: { model: "claude-opus-4-6", promptTemplate: `Analyze and plan: ${description}` },
      position: { x: X_CENTER, y },
    });
    y += Y_STEP;

    if (isCodeTask) {
      // Code workflow: plan -> implement -> review -> approval gate
      steps.push({
        tempId: "implement",
        name: "Implement",
        stepType: "agent_run",
        agentId: engineer?.id,
        agentName: engineer?.name,
        model: "claude-sonnet-4-6",
        config: { model: "claude-sonnet-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "plan", to: "implement" });
      y += Y_STEP;

      if (qa && qa.id !== engineer?.id) {
        steps.push({
          tempId: "review",
          name: "Code Review",
          stepType: "agent_run",
          agentId: qa.id,
          agentName: qa.name,
          model: "claude-opus-4-6",
          config: { model: "claude-opus-4-6" },
          position: { x: X_CENTER, y },
        });
        edges.push({ from: "implement", to: "review" });
        y += Y_STEP;
      }

      steps.push({
        tempId: "approve",
        name: "Review & Approve",
        stepType: "approval",
        config: { message: "Review the implementation before finalizing" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: steps[steps.length - 2].tempId, to: "approve" });

    } else if (isResearchTask) {
      // Research workflow: plan -> research -> synthesize
      steps.push({
        tempId: "research",
        name: "Research",
        stepType: "agent_run",
        agentId: findAgent(["researcher", "engineer"])?.id,
        model: "claude-opus-4-6",
        config: { model: "claude-opus-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "plan", to: "research" });
      y += Y_STEP;

      steps.push({
        tempId: "synthesize",
        name: "Synthesize Findings",
        stepType: "agent_run",
        agentId: pm?.id,
        model: "claude-sonnet-4-6",
        config: { model: "claude-sonnet-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "research", to: "synthesize" });

    } else if (isContentTask) {
      // Content workflow: plan -> draft -> review
      steps.push({
        tempId: "draft",
        name: "Draft Content",
        stepType: "agent_run",
        agentId: findAgent(["cmo", "pm", "general"])?.id,
        model: "claude-sonnet-4-6",
        config: { model: "claude-sonnet-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "plan", to: "draft" });
      y += Y_STEP;

      steps.push({
        tempId: "review",
        name: "Review & Polish",
        stepType: "agent_run",
        agentId: ceo?.id,
        model: "claude-opus-4-6",
        config: { model: "claude-opus-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "draft", to: "review" });

    } else {
      // Generic workflow: plan -> execute -> summarize
      steps.push({
        tempId: "execute",
        name: "Execute Task",
        stepType: "agent_run",
        agentId: availableAgents[0]?.id,
        model: "claude-sonnet-4-6",
        config: { model: "claude-sonnet-4-6" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "plan", to: "execute" });
      y += Y_STEP;

      steps.push({
        tempId: "summarize",
        name: "Summarize Results",
        stepType: "agent_run",
        agentId: ceo?.id,
        model: "claude-haiku-4-5",
        config: { model: "claude-haiku-4-5" },
        position: { x: X_CENTER, y },
      });
      edges.push({ from: "execute", to: "summarize" });
    }

    // Derive a readable name from the description
    const name = description.length > 50
      ? description.slice(0, 50).trim() + "..."
      : description;

    return {
      name: `Workflow: ${name}`,
      description,
      steps,
      edges,
    };
  }

  // ── LLM-based generation (future) ───────────────────────────────────────

  /**
   * Placeholder for LLM-powered workflow generation.
   *
   * When the Claude adapter and API keys are configured, this function can
   * replace `buildWorkflowFromDescription` to produce richer workflows by
   * sending a structured prompt that describes the available agents and asks
   * the model to return a JSON workflow definition.
   *
   * Expected prompt shape:
   *   - System: "You are a workflow planner. Given a task and a list of agents,
   *     output a JSON object with { name, description, steps[], edges[] }."
   *   - User: task description + serialised agent list
   *
   * The response would be parsed and validated before being persisted exactly
   * the same way `generate()` does today.
   */
  async function generateWithLLM(
    _description: string,
    _availableAgents: Array<{ id: string; name: string; role: string; adapterType: string }>,
  ): Promise<GeneratedWorkflow> {
    // TODO: integrate via adapter system once API keys are wired in
    throw new Error("LLM-based workflow generation is not yet implemented");
  }

  return { generate };
}
