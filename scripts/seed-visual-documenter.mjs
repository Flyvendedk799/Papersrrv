#!/usr/bin/env node
/**
 * Seed script: Visual Project Documenter workflow + built-in template.
 *
 * Usage:
 *   node scripts/seed-visual-documenter.mjs --company-id <UUID> --agent-id <UUID>
 *
 * If omitted, it will look for SEED_COMPANY_ID and SEED_AGENT_ID env vars.
 */

import postgres from "postgres";
import { randomUUID } from "crypto";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    "company-id": { type: "string" },
    "agent-id": { type: "string" },
    "database-url": { type: "string" },
  },
});

const companyId = args["company-id"] ?? process.env.SEED_COMPANY_ID;
const agentId = args["agent-id"] ?? process.env.SEED_AGENT_ID;
const databaseUrl =
  args["database-url"] ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/paperclip";

if (!companyId) {
  console.error("Error: --company-id or SEED_COMPANY_ID is required");
  process.exit(1);
}
if (!agentId) {
  console.error("Error: --agent-id or SEED_AGENT_ID is required");
  process.exit(1);
}

const sql = postgres(databaseUrl);

// ── Trigger config with input form schema ──────────────────────────────────
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
      placeholder:
        "Describe the flows, features, or areas you want documented...",
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

// ── Step definitions ─────────────────────────────────────────────────────────

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
        'Create a comprehensive, self-contained HTML visual document. Include: project overview section, flow-by-flow documentation with screenshots, technical specifications section if available, interactive navigation. Output: { files: [{ name, content, mimeType }] }.',
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

// ── Edge definitions (by step index) ─────────────────────────────────────────

const edgeDefs = [
  // Project Analysis → Auth Check
  { from: 0, to: 1, edgeType: "default" },
  // Auth Check → Auth Login (true)
  { from: 1, to: 2, edgeType: "condition_true" },
  // Auth Check → Auth Skip (false)
  { from: 1, to: 3, edgeType: "condition_false" },
  // Auth Login → Documentation Plan
  { from: 2, to: 4, edgeType: "default" },
  // Auth Skip → Documentation Plan
  { from: 3, to: 4, edgeType: "default" },
  // Documentation Plan → Flow Capture
  { from: 4, to: 5, edgeType: "default" },
  // Flow Capture → Tech Docs Check
  { from: 5, to: 6, edgeType: "default" },
  // Tech Docs Check → Tech Docs Gen (true)
  { from: 6, to: 7, edgeType: "condition_true" },
  // Tech Docs Check → Tech Docs Skip (false)
  { from: 6, to: 8, edgeType: "condition_false" },
  // Tech Docs Gen → Content Assembly
  { from: 7, to: 9, edgeType: "default" },
  // Tech Docs Skip → Content Assembly
  { from: 8, to: 9, edgeType: "default" },
  // Content Assembly → Visual Assembly
  { from: 9, to: 10, edgeType: "default" },
  // Visual Assembly → Review & Deliver
  { from: 10, to: 11, edgeType: "default" },
];

// ── Main seed function ──────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding Visual Project Documenter workflow...");
  console.log(`  Company: ${companyId}`);
  console.log(`  Agent:   ${agentId}`);

  // 1. Create the workflow
  const workflowId = randomUUID();
  await sql`
    INSERT INTO workflows (id, company_id, name, description, status, trigger_type, trigger_config, metadata)
    VALUES (
      ${workflowId},
      ${companyId},
      ${"Visual Project Documenter"},
      ${"Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output."},
      ${"active"},
      ${"manual"},
      ${JSON.stringify(triggerConfig)},
      ${JSON.stringify({ builtIn: true, version: "1.0.0" })}
    )
  `;
  console.log(`  Workflow created: ${workflowId}`);

  // 2. Create steps
  const stepIds = [];
  for (const def of stepDefs) {
    const stepId = randomUUID();
    stepIds.push(stepId);

    // agent_run steps get the agentId
    const stepAgentId = def.stepType === "agent_run" ? agentId : null;

    await sql`
      INSERT INTO workflow_steps (id, workflow_id, company_id, name, description, step_order, step_type, agent_id, config, position, input_mapping)
      VALUES (
        ${stepId},
        ${workflowId},
        ${companyId},
        ${def.name},
        ${null},
        ${def.stepOrder},
        ${def.stepType},
        ${stepAgentId},
        ${JSON.stringify(def.config)},
        ${JSON.stringify(def.position)},
        ${JSON.stringify({})}
      )
    `;
  }
  console.log(`  Created ${stepIds.length} steps`);

  // 3. Create edges
  for (const edge of edgeDefs) {
    const edgeId = randomUUID();
    await sql`
      INSERT INTO workflow_edges (id, workflow_id, company_id, source_step_id, target_step_id, edge_type)
      VALUES (
        ${edgeId},
        ${workflowId},
        ${companyId},
        ${stepIds[edge.from]},
        ${stepIds[edge.to]},
        ${edge.edgeType}
      )
    `;
  }
  console.log(`  Created ${edgeDefs.length} edges`);

  // 4. Save as built-in template
  const templateId = randomUUID();
  const stepsJson = stepDefs.map((def, idx) => ({
    id: stepIds[idx],
    name: def.name,
    stepOrder: def.stepOrder,
    stepType: def.stepType,
    agentId: def.stepType === "agent_run" ? agentId : null,
    config: def.config,
    position: def.position,
    inputMapping: {},
  }));
  const edgesJson = edgeDefs.map((edge) => ({
    id: randomUUID(),
    sourceStepId: stepIds[edge.from],
    targetStepId: stepIds[edge.to],
    edgeType: edge.edgeType,
    label: null,
  }));

  await sql`
    INSERT INTO workflow_templates (id, company_id, name, description, category, steps_json, edges_json, is_built_in)
    VALUES (
      ${templateId},
      ${companyId},
      ${"Visual Project Documenter"},
      ${"Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output."},
      ${"documentation"},
      ${JSON.stringify(stepsJson)},
      ${JSON.stringify(edgesJson)},
      ${true}
    )
  `;
  console.log(`  Template created: ${templateId}`);

  console.log("\nDone! Workflow is active and ready to run.");
}

try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
