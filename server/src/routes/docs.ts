import { Router } from "express";

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Paperclip API",
    version: "1.0.0",
    description:
      "API for the Paperclip AI project management platform. " +
      "Manages companies, agents, issues, workflows, files, and more.",
  },
  servers: [{ url: "/api", description: "Default API base" }],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns server health status and deployment info.",
        responses: { "200": { description: "Server is healthy" } },
      },
    },

    // ── Companies ──────────────────────────────────────────────
    "/companies": {
      get: {
        tags: ["Companies"],
        summary: "List companies",
        responses: { "200": { description: "Array of companies" } },
      },
      post: {
        tags: ["Companies"],
        summary: "Create a company",
        responses: { "201": { description: "Created company" } },
      },
    },
    "/companies/{companyId}": {
      get: {
        tags: ["Companies"],
        summary: "Get a company by ID",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Company object" } },
      },
      patch: {
        tags: ["Companies"],
        summary: "Update a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated company" } },
      },
      delete: {
        tags: ["Companies"],
        summary: "Delete a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" } },
      },
    },

    // ── Agents ─────────────────────────────────────────────────
    "/companies/{companyId}/agents": {
      get: {
        tags: ["Agents"],
        summary: "List agents for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of agents" } },
      },
      post: {
        tags: ["Agents"],
        summary: "Create an agent",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created agent" } },
      },
    },
    "/companies/{companyId}/agents/{agentId}": {
      get: {
        tags: ["Agents"],
        summary: "Get an agent by ID",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "agentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Agent object" } },
      },
      patch: {
        tags: ["Agents"],
        summary: "Update an agent",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "agentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Updated agent" } },
      },
      delete: {
        tags: ["Agents"],
        summary: "Delete an agent",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "agentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },

    // ── Issues ─────────────────────────────────────────────────
    "/companies/{companyId}/issues": {
      get: {
        tags: ["Issues"],
        summary: "List issues for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of issues" } },
      },
      post: {
        tags: ["Issues"],
        summary: "Create an issue",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created issue" } },
      },
    },
    "/companies/{companyId}/issues/{issueId}": {
      get: {
        tags: ["Issues"],
        summary: "Get an issue by ID",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "issueId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Issue object" } },
      },
      patch: {
        tags: ["Issues"],
        summary: "Update an issue",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "issueId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Updated issue" } },
      },
      delete: {
        tags: ["Issues"],
        summary: "Delete an issue",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "issueId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },

    // ── Workflows ──────────────────────────────────────────────
    "/companies/{companyId}/workflows": {
      get: {
        tags: ["Workflows"],
        summary: "List workflows for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of workflows" } },
      },
      post: {
        tags: ["Workflows"],
        summary: "Create a workflow",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created workflow" } },
      },
    },
    "/companies/{companyId}/workflows/{workflowId}": {
      get: {
        tags: ["Workflows"],
        summary: "Get a workflow by ID",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Workflow object" } },
      },
      patch: {
        tags: ["Workflows"],
        summary: "Update a workflow",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Updated workflow" } },
      },
      delete: {
        tags: ["Workflows"],
        summary: "Delete a workflow",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },

    // ── Files ──────────────────────────────────────────────────
    "/companies/{companyId}/files": {
      get: {
        tags: ["Files"],
        summary: "List files for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of files" } },
      },
      post: {
        tags: ["Files"],
        summary: "Upload a file",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Uploaded file metadata" } },
      },
    },

    // ── Projects ───────────────────────────────────────────────
    "/companies/{companyId}/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of projects" } },
      },
      post: {
        tags: ["Projects"],
        summary: "Create a project",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created project" } },
      },
    },

    // ── Goals ──────────────────────────────────────────────────
    "/companies/{companyId}/goals": {
      get: {
        tags: ["Goals"],
        summary: "List goals for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of goals" } },
      },
      post: {
        tags: ["Goals"],
        summary: "Create a goal",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created goal" } },
      },
    },

    // ── Approvals ──────────────────────────────────────────────
    "/companies/{companyId}/approvals": {
      get: {
        tags: ["Approvals"],
        summary: "List pending approvals",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of approvals" } },
      },
    },

    // ── Costs ──────────────────────────────────────────────────
    "/companies/{companyId}/costs": {
      get: {
        tags: ["Costs"],
        summary: "Get cost data for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cost summary" } },
      },
    },

    // ── Activity ───────────────────────────────────────────────
    "/companies/{companyId}/activity": {
      get: {
        tags: ["Activity"],
        summary: "Get activity feed for a company",
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Activity entries" } },
      },
    },
  },
  tags: [
    { name: "Health", description: "Server health and status" },
    { name: "Companies", description: "Company management" },
    { name: "Agents", description: "AI agent configuration and management" },
    { name: "Issues", description: "Issue tracking" },
    { name: "Workflows", description: "Workflow definitions and execution" },
    { name: "Files", description: "File uploads and management" },
    { name: "Projects", description: "Project management" },
    { name: "Goals", description: "Goal tracking" },
    { name: "Approvals", description: "Approval workflows" },
    { name: "Costs", description: "Cost tracking and reporting" },
    { name: "Activity", description: "Activity feed and audit log" },
  ],
};

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Paperclip API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/docs/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
    });
  </script>
</body>
</html>`;

export function docsRoutes() {
  const router = Router();

  router.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  router.get("/", (_req, res) => {
    res.type("html").send(swaggerHtml);
  });

  return router;
}
