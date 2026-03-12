/**
 * Auto-seed built-in workflow templates on startup.
 *
 * Runs idempotently — only creates templates that don't already exist
 * (matched by name + isBuiltIn flag). Does NOT create workflow instances;
 * users instantiate from the template when they want one.
 */

import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  companies,
  workflows,
  workflowSteps,
  workflowEdges,
  workflowTemplates,
} from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ── Visual Project Documenter definition ────────────────────────────────────

const VISUAL_DOCUMENTER_NAME = "Visual Project Documenter";

const triggerConfig = {
  inputs: [
    {
      key: "projectSource",
      label: "Project Source",
      type: "text",
      required: true,
      placeholder: "GitHub URL, website URL, or file path",
    },
    {
      key: "description",
      label: "What to Document",
      type: "textarea",
      required: true,
      placeholder: "Describe the flows, features, or areas you want documented...",
    },
    {
      key: "needsAuth",
      label: "Authentication Required?",
      type: "boolean",
      defaultValue: false,
    },
    {
      key: "authUsername",
      label: "Username / Email",
      type: "text",
      showWhen: { field: "needsAuth", value: true },
    },
    {
      key: "authPassword",
      label: "Password",
      type: "password",
      showWhen: { field: "needsAuth", value: true },
    },
    {
      key: "includeTechDocs",
      label: "Include Technical Documentation?",
      type: "boolean",
      defaultValue: true,
    },
    {
      key: "delegationMode",
      label: "Delegation Mode",
      type: "select",
      defaultValue: "ai",
      options: [
        { label: "AI Delegates (automatic)", value: "ai" },
        { label: "User Delegates (manual)", value: "user" },
      ],
    },
  ],
};

const stepDefs = [
  {
    name: "Project Analysis",
    stepType: "agent_run",
    stepOrder: 0,
    position: { x: 300, y: 0 },
    config: {
      promptTemplate:
        "Analyze the project at {{projectSource}}. Identify: tech stack, key pages/routes, navigation structure, main user flows. Output a structured JSON with sitemap, flowList, and techStack.",
    },
  },
  {
    name: "Auth Check",
    stepType: "condition",
    stepOrder: 1,
    position: { x: 300, y: 140 },
    config: { field: "needsAuth", operator: "eq", value: true },
  },
  {
    name: "Auth Login",
    stepType: "agent_run",
    stepOrder: 2,
    position: { x: 100, y: 280 },
    config: {
      skillName: "playwright-skill",
      promptTemplate:
        "Using Playwright, navigate to {{projectSource}} and log in with username={{authUsername}} password={{authPassword}}. Verify login succeeded. Output { loginSucceeded: true, cookies: [...] }.",
    },
  },
  {
    name: "Auth Skip",
    stepType: "transform",
    stepOrder: 3,
    position: { x: 500, y: 280 },
    config: { mapping: {} },
  },
  {
    name: "Documentation Plan",
    stepType: "parallel_gate",
    stepOrder: 4,
    position: { x: 300, y: 420 },
    config: { waitFor: "all" },
  },
  {
    name: "Flow Capture",
    stepType: "agent_run",
    stepOrder: 5,
    position: { x: 300, y: 560 },
    config: {
      skillName: "playwright-skill",
      promptTemplate:
        "Using the documentation plan from previous steps, systematically walk through each flow at {{projectSource}}. For each flow: navigate to the page, take screenshots of each state, record key interactions. Output: { flows: [{ name, screenshots: [...], description }] }.",
    },
  },
  {
    name: "Tech Docs Check",
    stepType: "condition",
    stepOrder: 6,
    position: { x: 300, y: 700 },
    config: { field: "includeTechDocs", operator: "eq", value: true },
  },
  {
    name: "Tech Docs Gen",
    stepType: "agent_run",
    stepOrder: 7,
    position: { x: 100, y: 840 },
    config: {
      skillName: "markitdown",
      promptTemplate:
        "Generate technical documentation for the project. Convert any relevant files to markdown. Include: architecture overview, API endpoints, data models, deployment info. Output: { documents: [{ title, content }] }.",
    },
  },
  {
    name: "Tech Docs Skip",
    stepType: "transform",
    stepOrder: 8,
    position: { x: 500, y: 840 },
    config: { mapping: {} },
  },
  {
    name: "Content Assembly",
    stepType: "parallel_gate",
    stepOrder: 9,
    position: { x: 300, y: 980 },
    config: { waitFor: "all" },
  },
  {
    name: "Visual Assembly",
    stepType: "agent_run",
    stepOrder: 10,
    position: { x: 300, y: 1120 },
    config: {
      skillName: "visual-explainer",
      promptTemplate:
        "Create a comprehensive, self-contained HTML visual document. Include: project overview section, flow-by-flow documentation with screenshots, technical specifications section if available, interactive navigation. Output: { files: [{ name, content, mimeType }] }.",
    },
  },
  {
    name: "Review & Deliver",
    stepType: "approval",
    stepOrder: 11,
    position: { x: 300, y: 1260 },
    config: {
      message: "Review the generated visual documentation before delivery.",
      showContext: true,
    },
  },
];

const edgeDefs = [
  { from: 0, to: 1, edgeType: "default" },
  { from: 1, to: 2, edgeType: "condition_true" },
  { from: 1, to: 3, edgeType: "condition_false" },
  { from: 2, to: 4, edgeType: "default" },
  { from: 3, to: 4, edgeType: "default" },
  { from: 4, to: 5, edgeType: "default" },
  { from: 5, to: 6, edgeType: "default" },
  { from: 6, to: 7, edgeType: "condition_true" },
  { from: 6, to: 8, edgeType: "condition_false" },
  { from: 7, to: 9, edgeType: "default" },
  { from: 8, to: 9, edgeType: "default" },
  { from: 9, to: 10, edgeType: "default" },
  { from: 10, to: 11, edgeType: "default" },
];

// ── Seed logic ──────────────────────────────────────────────────────────────

async function seedVisualDocumenterForCompany(db: Db, companyId: string): Promise<boolean> {
  // Check if workflow already exists for this company
  const existing = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(
        eq(workflows.companyId, companyId),
        eq(workflows.name, VISUAL_DOCUMENTER_NAME),
      ),
    );

  if (existing.length > 0) return false;

  // Create the workflow
  const [workflow] = await db
    .insert(workflows)
    .values({
      companyId,
      name: VISUAL_DOCUMENTER_NAME,
      description:
        "Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output.",
      status: "active",
      triggerType: "manual",
      triggerConfig,
      metadata: { builtIn: true, version: "1.0.0" },
    })
    .returning();

  // Create steps (agent_run steps get no agentId — user picks when they configure)
  const stepIds: string[] = [];
  for (const def of stepDefs) {
    const [step] = await db
      .insert(workflowSteps)
      .values({
        workflowId: workflow.id,
        companyId,
        name: def.name,
        stepOrder: def.stepOrder,
        stepType: def.stepType,
        config: def.config,
        position: def.position,
        inputMapping: {},
      })
      .returning();
    stepIds.push(step.id);
  }

  // Create edges
  for (const edge of edgeDefs) {
    await db.insert(workflowEdges).values({
      workflowId: workflow.id,
      companyId,
      sourceStepId: stepIds[edge.from],
      targetStepId: stepIds[edge.to],
      edgeType: edge.edgeType,
    });
  }

  // Also save as template (snapshot steps + edges)
  const existingTemplate = await db
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.companyId, companyId),
        eq(workflowTemplates.name, VISUAL_DOCUMENTER_NAME),
      ),
    );

  if (existingTemplate.length === 0) {
    const stepsJson = stepDefs.map((def, idx) => ({
      name: def.name,
      stepOrder: def.stepOrder,
      stepType: def.stepType,
      config: def.config,
      position: def.position,
      inputMapping: {},
    }));
    const edgesJson = edgeDefs.map((edge) => ({
      sourceStepIndex: edge.from,
      targetStepIndex: edge.to,
      edgeType: edge.edgeType,
    }));

    await db.insert(workflowTemplates).values({
      companyId,
      name: VISUAL_DOCUMENTER_NAME,
      description:
        "Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output.",
      category: "documentation",
      stepsJson,
      edgesJson,
    });
  }

  return true;
}

export async function seedBuiltInWorkflows(db: Db): Promise<void> {
  try {
    const allCompanies = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, "active"));

    let seeded = 0;
    for (const company of allCompanies) {
      const created = await seedVisualDocumenterForCompany(db, company.id);
      if (created) seeded++;
    }

    if (seeded > 0) {
      logger.info({ seeded, companies: allCompanies.length }, "seed: created built-in workflows");
    }
  } catch (err) {
    logger.warn({ err }, "seed: built-in workflow seeding failed (non-fatal)");
  }
}
