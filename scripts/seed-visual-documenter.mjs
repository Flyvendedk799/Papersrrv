#!/usr/bin/env node
/**
 * Seed script: Visual Project Documenter workflow + built-in template.
 *
 * Uses the REST API (works with embedded-postgres, no direct DB needed).
 *
 * Usage:
 *   node scripts/seed-visual-documenter.mjs --company-id <UUID> --agent-id <UUID>
 *
 * Options:
 *   --api-url    Base URL (default: http://localhost:3100/api)
 *   --company-id Company UUID (or SEED_COMPANY_ID env)
 *   --agent-id   Agent UUID (or SEED_AGENT_ID env)
 */

import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    "company-id": { type: "string" },
    "agent-id": { type: "string" },
    "api-url": { type: "string" },
  },
});

const companyId = args["company-id"] ?? process.env.SEED_COMPANY_ID;
const agentId = args["agent-id"] ?? process.env.SEED_AGENT_ID;
const apiUrl = args["api-url"] ?? process.env.API_URL ?? "http://localhost:3100/api";

if (!companyId) {
  console.error("Error: --company-id or SEED_COMPANY_ID is required");
  process.exit(1);
}
if (!agentId) {
  console.error("Error: --agent-id or SEED_AGENT_ID is required");
  process.exit(1);
}

// ── Helper ──────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

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

// ── Main seed function ──────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding Visual Project Documenter workflow via REST API...");
  console.log(`  API:     ${apiUrl}`);
  console.log(`  Company: ${companyId}`);
  console.log(`  Agent:   ${agentId}`);

  const base = `/companies/${companyId}`;

  // 1. Create the workflow
  const workflow = await api("POST", `${base}/workflows`, {
    name: "Visual Project Documenter",
    description:
      "Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output.",
    status: "active",
    triggerType: "manual",
    triggerConfig,
    metadata: { builtIn: true, version: "1.0.0" },
  });
  const workflowId = workflow.id;
  console.log(`  Workflow created: ${workflowId}`);

  // 2. Create steps (sequentially to preserve order)
  const stepIds = [];
  for (const def of stepDefs) {
    const stepAgentId = def.stepType === "agent_run" ? agentId : undefined;
    const step = await api("POST", `${base}/workflows/${workflowId}/steps`, {
      name: def.name,
      stepOrder: def.stepOrder,
      stepType: def.stepType,
      agentId: stepAgentId,
      config: def.config,
      position: def.position,
      inputMapping: {},
    });
    stepIds.push(step.id);
  }
  console.log(`  Created ${stepIds.length} steps`);

  // 3. Create edges
  for (const edge of edgeDefs) {
    await api("POST", `${base}/workflows/${workflowId}/edges`, {
      sourceStepId: stepIds[edge.from],
      targetStepId: stepIds[edge.to],
      edgeType: edge.edgeType,
    });
  }
  console.log(`  Created ${edgeDefs.length} edges`);

  // 4. Save as built-in template (snapshot from the workflow we just created)
  await api("POST", `${base}/workflow-templates`, {
    workflowId,
    name: "Visual Project Documenter",
    description:
      "Automatically document any project with AI-powered screenshots, flow walkthroughs, and polished visual HTML output.",
    category: "documentation",
  });
  console.log("  Template created (snapshot from workflow)");

  console.log("\nDone! Workflow is active and ready to run.");
}

try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
}
