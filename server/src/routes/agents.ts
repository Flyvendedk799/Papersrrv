import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, companies, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import {
  createAgentKeySchema,
  createAgentHireSchema,
  createAgentSchema,
  isUuidLike,
  resetAgentSessionSchema,
  testAdapterEnvironmentSchema,
  updateAgentPermissionsSchema,
  updateAgentInstructionsPathSchema,
  wakeAgentSchema,
  updateAgentSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  agentService,
  accessService,
  approvalService,
  fileService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  secretService,
} from "../services/index.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { findServerAdapter, listAdapterModels } from "../adapters/index.js";
import { redactEventPayload } from "../redaction.js";
import { parsePaginationParams, buildPaginatedResponse } from "../lib/pagination.js";
import { runClaudeLogin } from "@paperclipai/adapter-claude-local/server";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { ensureOpenCodeModelConfiguredAndAvailable } from "@paperclipai/adapter-opencode-local/server";

/**
 * Default command for the Cursor adapter.
 * On Linux/macOS the `agent` binary is on the PATH.
 * On Windows/WSL the previous default was "wsl -d Ubuntu -- /root/.local/bin/agent".
 * This can be overridden per-agent via adapterConfig.command.
 */
const DEFAULT_CURSOR_COMMAND = process.platform === "win32"
  ? "wsl -d Ubuntu -- /root/.local/bin/agent"
  : "agent";

/** All agents use composer-1.5 via Cursor subscription through WSL. */
function pickDefaultModel(): string {
  return "composer-1.5";
}

/**
 * Auto-scaffold AGENTS.md + HEARTBEAT.md for a newly created agent and patch
 * its adapterConfig so the adapter picks them up on the first heartbeat.
 * Silently no-ops if the files already exist or the agents/ directory is missing.
 */
async function scaffoldAgentInstructions(
  db: Db,
  agent: { id: string; name: string; title: string | null; capabilities: string | null; adapterConfig: Record<string, unknown> | null },
) {
  try {
    const agentsDir = path.resolve(process.cwd(), "agents");
    if (!fs.existsSync(agentsDir)) return;

    const slug = agent.name.toLowerCase().replace(/\s+/g, "-");
    const dir = path.join(agentsDir, slug);
    const agentsMdPath = path.join(dir, "AGENTS.md");
    const heartbeatMdPath = path.join(dir, "HEARTBEAT.md");

    if (fs.existsSync(agentsMdPath)) return; // already scaffolded

    fs.mkdirSync(dir, { recursive: true });

    const displayName = agent.title || agent.name;
    const caps = agent.capabilities || `Carry out assigned work as ${displayName}.`;
    const isLead = /chief|lead|manager|ceo|coo|cto|vp/i.test(agent.name);

    const agentsMd = [
      `You are ${displayName}.`,
      "",
      "Your home directory is $AGENT_HOME. Everything personal to you -- memory, notes -- lives there.",
      "",
      "## References",
      "",
      "These files are essential. Read them.",
      "",
      "- `$AGENT_HOME/HEARTBEAT.md` -- execution checklist. Run every heartbeat.",
      "",
      "## Standards",
      "",
      "Read and follow these standards. They define how you work.",
      "",
      "- `../standards/general.md` -- universal rules for all agents.",
      "- `../standards/summaries.md` -- how and when to write summary files.",
      "- `../standards/communication.md` -- comment style, status updates, handoffs.",
      "",
      "## Safety Considerations",
      "",
      "- Never exfiltrate secrets or private data.",
      "- Do not perform any destructive commands unless explicitly requested by your manager or the board.",
      "",
    ].join("\n");

    const delegationSection = isLead
      ? [
          "",
          "## 4. Delegation",
          "",
          "- Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId`.",
          "- Assign work to the right agent for the job.",
          "",
        ].join("\n")
      : "";

    const exitStep = isLead ? "5" : "4";

    const heartbeatMd = [
      `# HEARTBEAT.md -- ${displayName} Heartbeat Checklist`,
      "",
      "Run this checklist on every heartbeat.",
      "",
      "## 1. Identity and Context",
      "",
      "- `GET /api/agents/me` -- confirm your id, role, company.",
      "- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.",
      "",
      "## 2. Get Assignments",
      "",
      "- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`",
      "- Prioritize: `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.",
      "- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.",
      "",
      "## 3. Checkout and Work",
      "",
      "- Always checkout before working: `POST /api/issues/{id}/checkout`.",
      "- Never retry a 409 -- that task belongs to someone else or another run.",
      "- Do the work. Update status and comment when done.",
      "- When completing an issue, set status to `done` via `PATCH /api/issues/{id}` and post a comment with your deliverable.",
      delegationSection,
      `## ${exitStep}. Exit`,
      "",
      "- Comment on any in_progress work before exiting.",
      "- If no assignments, exit cleanly.",
      "",
      "---",
      "",
      `## ${displayName} Responsibilities`,
      "",
      caps,
      "",
      "**Never look for unassigned work** -- only work on what is assigned to you.",
      "",
      "## Rules",
      "",
      "- Always include `X-Paperclip-Run-Id` header on mutating API calls.",
      "- Comment in concise markdown: status line + bullets + links.",
      "",
      "## API Quick Reference",
      "",
      "Use `$PAPERCLIP_API_URL` as the base. Authenticate with `Authorization: Bearer $PAPERCLIP_API_KEY`.",
      "Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` header on all mutating (POST/PATCH/DELETE) calls.",
      "",
      "| Action | Method | Endpoint |",
      "|--------|--------|----------|",
      "| Who am I? | GET | `/api/agents/me` |",
      "| List my issues | GET | `/api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` |",
      "| Get issue detail | GET | `/api/issues/{id}` |",
      "| Create issue | POST | `/api/companies/{companyId}/issues` |",
      "| Update issue (status, fields) | PATCH | `/api/issues/{id}` -- body: `{status, title, description, ...}` |",
      "| Checkout issue | POST | `/api/issues/{id}/checkout` -- body: `{agentId, expectedStatuses}` |",
      "| Release checkout | POST | `/api/issues/{id}/release` |",
      "| List comments | GET | `/api/issues/{id}/comments` |",
      "| Post comment | POST | `/api/issues/{id}/comments` -- body: `{body}` |",
      "| List agents | GET | `/api/companies/{companyId}/agents` |",
      "| Request hire | POST | `/api/companies/{companyId}/approvals` -- body: `{type: \"hire_agent\", payload: {...}}` |",
      "| List approvals | GET | `/api/companies/{companyId}/approvals` |",
      "",
    ].join("\n");

    fs.writeFileSync(agentsMdPath, agentsMd);
    fs.writeFileSync(heartbeatMdPath, heartbeatMd);

    // Patch adapterConfig with instructionsFilePath and cwd
    const config = (agent.adapterConfig ?? {}) as Record<string, unknown>;
    let needsUpdate = false;
    if (!config.instructionsFilePath) {
      config.instructionsFilePath = agentsMdPath;
      config.cwd = agentsDir;
      needsUpdate = true;
    }
    // Set Cursor via WSL defaults for new agents
    if (!config.model) {
      config.model = pickDefaultModel();
      needsUpdate = true;
    }
    if (!config.command) {
      config.command = DEFAULT_CURSOR_COMMAND;
      config.cwd = agentsDir;
      config.workspaceOverride = "/root/paperclip-agents";
      needsUpdate = true;
    }
    if (needsUpdate) {
      const { agents: agentsSchema } = await import("@paperclipai/db");
      const drizzle = await import("drizzle-orm");
      await db
        .update(agentsSchema)
        .set({ adapterType: "cursor", adapterConfig: config, updatedAt: new Date() })
        .where(drizzle.eq(agentsSchema.id, agent.id));
    }
  } catch {
    // Non-critical — agent still works, just without instruction files
  }
}

export function agentRoutes(db: Db) {
  const DEFAULT_INSTRUCTIONS_PATH_KEYS: Record<string, string> = {
    claude_local: "instructionsFilePath",
    codex_local: "instructionsFilePath",
    opencode_local: "instructionsFilePath",
    cursor: "instructionsFilePath",
  };
  const KNOWN_INSTRUCTIONS_PATH_KEYS = new Set(["instructionsFilePath", "agentsMdPath"]);

  const router = Router();
  const svc = agentService(db);
  const access = accessService(db);
  const approvalsSvc = approvalService(db);
  const heartbeat = heartbeatService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const secretsSvc = secretService(db);
  const fileSvc = fileService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  function canCreateAgents(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function assertCanCreateAgentsForCompany(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") {
      if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return null;
      const allowed = await access.canUser(companyId, req.actor.userId, "agents:create");
      if (!allowed) {
        throw forbidden("Missing permission: agents:create");
      }
      return null;
    }
    if (!req.actor.agentId) throw forbidden("Agent authentication required");
    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    if (!allowedByGrant && !canCreateAgents(actorAgent)) {
      throw forbidden("Missing permission: can create agents");
    }
    return actorAgent;
  }

  async function assertCanReadConfigurations(req: Request, companyId: string) {
    return assertCanCreateAgentsForCompany(req, companyId);
  }

  async function actorCanReadConfigurationsForCompany(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") {
      if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return true;
      return access.canUser(companyId, req.actor.userId, "agents:create");
    }
    if (!req.actor.agentId) return false;
    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) return false;
    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    return allowedByGrant || canCreateAgents(actorAgent);
  }

  async function assertCanUpdateAgent(req: Request, targetAgent: { id: string; companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
      throw forbidden("Agent key cannot access another company");
    }

    if (actorAgent.id === targetAgent.id) return;
    if (actorAgent.role === "ceo") return;
    const allowedByGrant = await access.hasPermission(
      targetAgent.companyId,
      "agent",
      actorAgent.id,
      "agents:create",
    );
    if (allowedByGrant || canCreateAgents(actorAgent)) return;
    throw forbidden("Only CEO or agent creators can modify other agents");
  }

  async function resolveCompanyIdForAgentReference(req: Request): Promise<string | null> {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeAgentReference(req: Request, rawId: string): Promise<string> {
    const raw = rawId.trim();
    if (isUuidLike(raw)) return raw;

    const companyId = await resolveCompanyIdForAgentReference(req);
    if (!companyId) {
      throw unprocessable("Agent shortname lookup requires companyId query parameter");
    }

    const resolved = await svc.resolveByReference(companyId, raw);
    if (resolved.ambiguous) {
      throw conflict("Agent shortname is ambiguous in this company. Use the agent ID.");
    }
    if (!resolved.agent) {
      throw notFound("Agent not found");
    }
    return resolved.agent.id;
  }

  function parseSourceIssueIds(input: {
    sourceIssueId?: string | null;
    sourceIssueIds?: string[];
  }): string[] {
    const values: string[] = [];
    if (Array.isArray(input.sourceIssueIds)) values.push(...input.sourceIssueIds);
    if (typeof input.sourceIssueId === "string" && input.sourceIssueId.length > 0) {
      values.push(input.sourceIssueId);
    }
    return Array.from(new Set(values));
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function applyCreateDefaultsByAdapterType(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...adapterConfig };
    if (adapterType === "codex_local") {
      if (!asNonEmptyString(next.model)) {
        next.model = DEFAULT_CODEX_LOCAL_MODEL;
      }
      const hasBypassFlag =
        typeof next.dangerouslyBypassApprovalsAndSandbox === "boolean" ||
        typeof next.dangerouslyBypassSandbox === "boolean";
      if (!hasBypassFlag) {
        next.dangerouslyBypassApprovalsAndSandbox = DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
      }
      return next;
    }
    // OpenCode requires explicit model selection — no default
    if (adapterType === "cursor" && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_CURSOR_LOCAL_MODEL;
    }
    return next;
  }

  async function assertAdapterConfigConstraints(
    companyId: string,
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ) {
    if (adapterType !== "opencode_local") return;
    const runtimeConfig = await secretsSvc.resolveAdapterConfigForRuntime(companyId, adapterConfig);
    const runtimeEnv = asRecord(runtimeConfig.env) ?? {};
    try {
      await ensureOpenCodeModelConfiguredAndAvailable({
        model: runtimeConfig.model,
        command: runtimeConfig.command,
        cwd: runtimeConfig.cwd,
        env: runtimeEnv,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw unprocessable(`Invalid opencode_local adapterConfig: ${reason}`);
    }
  }

  function resolveInstructionsFilePath(candidatePath: string, adapterConfig: Record<string, unknown>) {
    const trimmed = candidatePath.trim();
    if (path.isAbsolute(trimmed)) return trimmed;

    const cwd = asNonEmptyString(adapterConfig.cwd);
    if (!cwd) {
      throw unprocessable(
        "Relative instructions path requires adapterConfig.cwd to be set to an absolute path",
      );
    }
    if (!path.isAbsolute(cwd)) {
      throw unprocessable("adapterConfig.cwd must be an absolute path to resolve relative instructions path");
    }
    return path.resolve(cwd, trimmed);
  }

  async function assertCanManageInstructionsPath(req: Request, targetAgent: { id: string; companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    if (actorAgent.id === targetAgent.id) return;

    const chainOfCommand = await svc.getChainOfCommand(targetAgent.id);
    if (chainOfCommand.some((manager) => manager.id === actorAgent.id)) return;

    throw forbidden("Only the target agent or an ancestor manager can update instructions path");
  }

  function summarizeAgentUpdateDetails(patch: Record<string, unknown>) {
    const changedTopLevelKeys = Object.keys(patch).sort();
    const details: Record<string, unknown> = { changedTopLevelKeys };

    const adapterConfigPatch = asRecord(patch.adapterConfig);
    if (adapterConfigPatch) {
      details.changedAdapterConfigKeys = Object.keys(adapterConfigPatch).sort();
    }

    const runtimeConfigPatch = asRecord(patch.runtimeConfig);
    if (runtimeConfigPatch) {
      details.changedRuntimeConfigKeys = Object.keys(runtimeConfigPatch).sort();
    }

    return details;
  }

  function redactForRestrictedAgentView(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      ...agent,
      adapterConfig: {},
      runtimeConfig: {},
    };
  }

  function redactAgentConfiguration(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      status: agent.status,
      reportsTo: agent.reportsTo,
      adapterType: agent.adapterType,
      adapterConfig: redactEventPayload(agent.adapterConfig),
      runtimeConfig: redactEventPayload(agent.runtimeConfig),
      permissions: agent.permissions,
      updatedAt: agent.updatedAt,
    };
  }

  function redactRevisionSnapshot(snapshot: unknown): Record<string, unknown> {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
    const record = snapshot as Record<string, unknown>;
    return {
      ...record,
      adapterConfig: redactEventPayload(
        typeof record.adapterConfig === "object" && record.adapterConfig !== null
          ? (record.adapterConfig as Record<string, unknown>)
          : {},
      ),
      runtimeConfig: redactEventPayload(
        typeof record.runtimeConfig === "object" && record.runtimeConfig !== null
          ? (record.runtimeConfig as Record<string, unknown>)
          : {},
      ),
      metadata:
        typeof record.metadata === "object" && record.metadata !== null
          ? redactEventPayload(record.metadata as Record<string, unknown>)
          : record.metadata ?? null,
    };
  }

  function redactConfigRevision(
    revision: Record<string, unknown> & { beforeConfig: unknown; afterConfig: unknown },
  ) {
    return {
      ...revision,
      beforeConfig: redactRevisionSnapshot(revision.beforeConfig),
      afterConfig: redactRevisionSnapshot(revision.afterConfig),
    };
  }

  function toLeanOrgNode(node: Record<string, unknown>): Record<string, unknown> {
    const reports = Array.isArray(node.reports)
      ? (node.reports as Array<Record<string, unknown>>).map((report) => toLeanOrgNode(report))
      : [];
    return {
      id: String(node.id),
      name: String(node.name),
      role: String(node.role),
      status: String(node.status),
      reports,
    };
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeAgentReference(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/adapters/:type/models", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const type = req.params.type as string;
    const models = await listAdapterModels(type);
    res.json(models);
  });

  router.post(
    "/companies/:companyId/adapters/:type/test-environment",
    validate(testAdapterEnvironmentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const type = req.params.type as string;
      await assertCanReadConfigurations(req, companyId);

      const adapter = findServerAdapter(type);
      if (!adapter) {
        res.status(404).json({ error: `Unknown adapter type: ${type}` });
        return;
      }

      const inputAdapterConfig =
        (req.body?.adapterConfig ?? {}) as Record<string, unknown>;
      const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        inputAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      const runtimeAdapterConfig = await secretsSvc.resolveAdapterConfigForRuntime(
        companyId,
        normalizedAdapterConfig,
      );

      const result = await adapter.testEnvironment({
        companyId,
        adapterType: type,
        config: runtimeAdapterConfig,
      });

      res.json(result);
    },
  );

  router.get("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const wantsPagination = req.query.cursor !== undefined || req.query.limit !== undefined;
    const { cursor, limit } = parsePaginationParams(req.query as Record<string, unknown>);
    const result = await svc.list(companyId, { cursor, limit });

    const canReadConfigs = await actorCanReadConfigurationsForCompany(req, companyId);
    const items = (canReadConfigs || req.actor.type === "board")
      ? result
      : result.map((agent) => redactForRestrictedAgentView(agent)).filter((a) => a !== null);

    if (wantsPagination) {
      const paginated = buildPaginatedResponse(items, limit, (agent) => ({
        createdAt: agent.createdAt,
        id: agent.id,
      }));
      res.json(paginated);
    } else {
      res.json(items);
    }
  });

  router.get("/companies/:companyId/org", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const tree = await svc.orgForCompany(companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    res.json(leanTree);
  });

  router.get("/companies/:companyId/agent-configurations", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanReadConfigurations(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows.map((row) => redactAgentConfiguration(row)));
  });

  router.get("/agents/me", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }
    const agent = await svc.getById(req.actor.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const chainOfCommand = await svc.getChainOfCommand(agent.id);
    res.json({ ...agent, chainOfCommand });
  });

  router.get("/agents/:id", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);
    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      const canRead = await actorCanReadConfigurationsForCompany(req, agent.companyId);
      if (!canRead) {
        const chainOfCommand = await svc.getChainOfCommand(agent.id);
        res.json({ ...redactForRestrictedAgentView(agent), chainOfCommand });
        return;
      }
    }
    const chainOfCommand = await svc.getChainOfCommand(agent.id);
    res.json({ ...agent, chainOfCommand });
  });

  router.get("/agents/:id/configuration", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    res.json(redactAgentConfiguration(agent));
  });

  router.get("/agents/:id/config-revisions", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revisions = await svc.listConfigRevisions(id);
    res.json(revisions.map((revision) => redactConfigRevision(revision)));
  });

  router.get("/agents/:id/config-revisions/:revisionId", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revision = await svc.getConfigRevision(id, revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    res.json(redactConfigRevision(revision));
  });

  router.post("/agents/:id/config-revisions/:revisionId/rollback", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    const actor = getActorInfo(req);
    const updated = await svc.rollbackConfigRevision(id, revisionId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.config_rolled_back",
      entityType: "agent",
      entityId: updated.id,
      details: { revisionId },
    });

    res.json(updated);
  });

  router.get("/agents/:id/runtime-state", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const state = await heartbeat.getRuntimeState(id);
    res.json(state);
  });

  router.get("/agents/:id/task-sessions", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const sessions = await heartbeat.listTaskSessions(id);
    res.json(
      sessions.map((session) => ({
        ...session,
        sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
      })),
    );
  });

  router.post("/agents/:id/runtime-state/reset-session", validate(resetAgentSessionSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    const taskKey =
      typeof req.body.taskKey === "string" && req.body.taskKey.trim().length > 0
        ? req.body.taskKey.trim()
        : null;
    const state = await heartbeat.resetRuntimeSession(id, { taskKey });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.runtime_session_reset",
      entityType: "agent",
      entityId: id,
      details: { taskKey: taskKey ?? null },
    });

    res.json(state);
  });

  router.post("/companies/:companyId/agent-hires", validate(createAgentHireSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanCreateAgentsForCompany(req, companyId);
    const sourceIssueIds = parseSourceIssueIds(req.body);
    const { sourceIssueId: _sourceIssueId, sourceIssueIds: _sourceIssueIds, ...hireInput } = req.body;
    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      hireInput.adapterType,
      ((hireInput.adapterConfig ?? {}) as Record<string, unknown>),
    );
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      requestedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    await assertAdapterConfigConstraints(
      companyId,
      hireInput.adapterType,
      normalizedAdapterConfig,
    );
    const normalizedHireInput = {
      ...hireInput,
      adapterConfig: normalizedAdapterConfig,
    };

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const requiresApproval = company.requireBoardApprovalForNewAgents;
    const status = requiresApproval ? "pending_approval" : "idle";
    const agent = await svc.create(companyId, {
      ...normalizedHireInput,
      status,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });

    await scaffoldAgentInstructions(db, agent);

    let approval: Awaited<ReturnType<typeof approvalsSvc.getById>> | null = null;
    const actor = getActorInfo(req);

    if (requiresApproval) {
      const requestedAdapterType = normalizedHireInput.adapterType ?? agent.adapterType;
      const requestedAdapterConfig =
        redactEventPayload(
          (normalizedHireInput.adapterConfig ?? agent.adapterConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedRuntimeConfig =
        redactEventPayload(
          (normalizedHireInput.runtimeConfig ?? agent.runtimeConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedMetadata =
        redactEventPayload(
          ((normalizedHireInput.metadata ?? agent.metadata ?? {}) as Record<string, unknown>),
        ) ?? {};
      approval = await approvalsSvc.create(companyId, {
        type: "hire_agent",
        requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        status: "pending",
        payload: {
          name: normalizedHireInput.name,
          role: normalizedHireInput.role,
          title: normalizedHireInput.title ?? null,
          icon: normalizedHireInput.icon ?? null,
          reportsTo: normalizedHireInput.reportsTo ?? null,
          capabilities: normalizedHireInput.capabilities ?? null,
          adapterType: requestedAdapterType,
          adapterConfig: requestedAdapterConfig,
          runtimeConfig: requestedRuntimeConfig,
          budgetMonthlyCents:
            typeof normalizedHireInput.budgetMonthlyCents === "number"
              ? normalizedHireInput.budgetMonthlyCents
              : agent.budgetMonthlyCents,
          metadata: requestedMetadata,
          agentId: agent.id,
          requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
          requestedConfigurationSnapshot: {
            adapterType: requestedAdapterType,
            adapterConfig: requestedAdapterConfig,
            runtimeConfig: requestedRuntimeConfig,
          },
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      });

      if (sourceIssueIds.length > 0) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, sourceIssueIds, {
          agentId: actor.actorType === "agent" ? actor.actorId : null,
          userId: actor.actorType === "user" ? actor.actorId : null,
        });
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.hire_created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        requiresApproval,
        approvalId: approval?.id ?? null,
        issueIds: sourceIssueIds,
      },
    });

    if (approval) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "approval.created",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type, linkedAgentId: agent.id },
      });
    }

    res.status(201).json({ agent, approval });
  });

  router.post("/companies/:companyId/agents", validate(createAgentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    if (req.actor.type === "agent") {
      assertBoard(req);
    }

    const requestedAdapterConfig = applyCreateDefaultsByAdapterType(
      req.body.adapterType,
      ((req.body.adapterConfig ?? {}) as Record<string, unknown>),
    );
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      requestedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    await assertAdapterConfigConstraints(
      companyId,
      req.body.adapterType,
      normalizedAdapterConfig,
    );

    const agent = await svc.create(companyId, {
      ...req.body,
      adapterConfig: normalizedAdapterConfig,
      status: "idle",
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });

    await scaffoldAgentInstructions(db, agent);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.created",
      entityType: "agent",
      entityId: agent.id,
      details: { name: agent.name, role: agent.role },
    });

    res.status(201).json(agent);
  });

  router.patch("/agents/:id/permissions", validate(updateAgentPermissionsSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    if (req.actor.type === "agent") {
      const actorAgent = req.actor.agentId ? await svc.getById(req.actor.agentId) : null;
      if (!actorAgent || actorAgent.companyId !== existing.companyId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (actorAgent.role !== "ceo") {
        res.status(403).json({ error: "Only CEO can manage permissions" });
        return;
      }
    }

    const agent = await svc.updatePermissions(id, req.body);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.permissions_updated",
      entityType: "agent",
      entityId: agent.id,
      details: req.body,
    });

    res.json(agent);
  });

  router.patch("/agents/:id/instructions-path", validate(updateAgentInstructionsPathSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await assertCanManageInstructionsPath(req, existing);

    const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
    const explicitKey = asNonEmptyString(req.body.adapterConfigKey);
    const defaultKey = DEFAULT_INSTRUCTIONS_PATH_KEYS[existing.adapterType] ?? null;
    const adapterConfigKey = explicitKey ?? defaultKey;
    if (!adapterConfigKey) {
      res.status(422).json({
        error: `No default instructions path key for adapter type '${existing.adapterType}'. Provide adapterConfigKey.`,
      });
      return;
    }

    const nextAdapterConfig: Record<string, unknown> = { ...existingAdapterConfig };
    if (req.body.path === null) {
      delete nextAdapterConfig[adapterConfigKey];
    } else {
      nextAdapterConfig[adapterConfigKey] = resolveInstructionsFilePath(req.body.path, existingAdapterConfig);
    }

    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      nextAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    const actor = getActorInfo(req);
    const agent = await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_path_patch",
        },
      },
    );
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const updatedAdapterConfig = asRecord(agent.adapterConfig) ?? {};
    const pathValue = asNonEmptyString(updatedAdapterConfig[adapterConfigKey]);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_path_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        adapterConfigKey,
        path: pathValue,
        cleared: req.body.path === null,
      },
    });

    res.json({
      agentId: agent.id,
      adapterType: agent.adapterType,
      adapterConfigKey,
      path: pathValue,
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-agent file read/write — lets any agent in the same company read or
  // modify another agent's workspace files (AGENTS.md, HEARTBEAT.md, standards, etc.)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a relative file path against an agent's workspace (cwd).
   * Returns the absolute path if safe, or null if it escapes the workspace.
   */
  async function resolveAgentWorkspacePath(
    agent: { adapterConfig: Record<string, unknown> | null },
    relativePath: string,
  ): Promise<{ absolute: string; cwd: string } | null> {
    if (!relativePath || !relativePath.trim()) return null;

    const config = agent.adapterConfig as Record<string, unknown> | null;
    const cwd = config?.cwd;
    if (typeof cwd !== "string" || !path.isAbsolute(cwd)) return null;

    const resolved = path.resolve(cwd, relativePath);
    // Preliminary string check before hitting the filesystem
    if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) return null;

    // Resolve symlinks to prevent escaping the workspace
    try {
      const realCwd = await fsPromises.realpath(cwd);
      const realResolved = await fsPromises.realpath(path.dirname(resolved))
        .then((dir) => path.join(dir, path.basename(resolved)));
      if (!realResolved.startsWith(realCwd + path.sep) && realResolved !== realCwd) return null;
      return { absolute: realResolved, cwd: realCwd };
    } catch {
      // Parent dir doesn't exist yet — fall back to string check only (safe for writes)
      return { absolute: resolved, cwd };
    }
  }

  // GET /agents/:id/files?path=relative/path — read a file from another agent's workspace
  router.get("/agents/:id/files", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    assertCompanyAccess(req, agent.companyId);

    const filePath = req.query.path as string | undefined;
    if (!filePath || !filePath.trim()) {
      res.status(400).json({ error: "path query parameter is required" });
      return;
    }

    const resolved = await resolveAgentWorkspacePath(agent, filePath);
    if (!resolved) {
      res.status(400).json({ error: "Invalid file path or agent has no workspace configured" });
      return;
    }

    try {
      const stat = await fsPromises.stat(resolved.absolute);
      if (!stat.isFile()) {
        res.status(400).json({ error: "Path is not a file" });
        return;
      }
      if (stat.size > 2 * 1024 * 1024) {
        res.status(413).json({ error: "File too large" });
        return;
      }
      const content = await fsPromises.readFile(resolved.absolute, "utf-8");
      const isMarkdown = /\.(md|mdx|markdown)$/i.test(resolved.absolute);
      res.json({ content, isMarkdown, size: stat.size, path: filePath, agentId: id });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        res.status(404).json({ error: "File not found in agent workspace" });
        return;
      }
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  // PUT /agents/:id/files — write a file in another agent's workspace
  router.put("/agents/:id/files", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    assertCompanyAccess(req, agent.companyId);

    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || !filePath.trim() || typeof content !== "string") {
      res.status(400).json({ error: "path (non-empty string) and content (string) are required in the request body" });
      return;
    }

    const resolved = await resolveAgentWorkspacePath(agent, filePath);
    if (!resolved) {
      res.status(400).json({ error: "Invalid file path or agent has no workspace configured" });
      return;
    }

    try {
      // Ensure parent directories exist
      await fsPromises.mkdir(path.dirname(resolved.absolute), { recursive: true });
      // Check existence via async stat to avoid race condition
      const existed = await fsPromises.stat(resolved.absolute).then(() => true, () => false);
      await fsPromises.writeFile(resolved.absolute, content, "utf-8");

      // Record this as a file snapshot in CAS for history tracking
      const actor = getActorInfo(req);
      const operation = existed ? "edit" : "write";
      await fileSvc.createSnapshot(agent.companyId, {
        agentId: actor.agentId ?? id,
        runId: actor.runId ?? randomUUID(), // use run context if available, otherwise synthetic
        filePath: resolved.absolute,
        content,
        operation,
      });

      await logActivity(db, {
        companyId: agent.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "agent.file_written",
        entityType: "agent",
        entityId: id,
        details: { filePath, operation, targetAgentId: id },
      });

      res.json({ ok: true, path: filePath, operation, agentId: id });
    } catch (err: unknown) {
      logger.warn({ err, filePath: resolved.absolute, agentId: id }, "Failed to write agent file");
      res.status(500).json({ error: "Failed to write file" });
    }
  });

  router.patch("/agents/:id", validate(updateAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    if (Object.prototype.hasOwnProperty.call(req.body, "permissions")) {
      res.status(422).json({ error: "Use /api/agents/:id/permissions for permission changes" });
      return;
    }

    const patchData = { ...(req.body as Record<string, unknown>) };
    if (Object.prototype.hasOwnProperty.call(patchData, "adapterConfig")) {
      const adapterConfig = asRecord(patchData.adapterConfig);
      if (!adapterConfig) {
        res.status(422).json({ error: "adapterConfig must be an object" });
        return;
      }
      const changingInstructionsPath = Object.keys(adapterConfig).some((key) =>
        KNOWN_INSTRUCTIONS_PATH_KEYS.has(key),
      );
      if (changingInstructionsPath) {
        await assertCanManageInstructionsPath(req, existing);
      }
      patchData.adapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        existing.companyId,
        adapterConfig,
        { strictMode: strictSecretsMode },
      );
    }

    const requestedAdapterType =
      typeof patchData.adapterType === "string" ? patchData.adapterType : existing.adapterType;
    const touchesAdapterConfiguration =
      Object.prototype.hasOwnProperty.call(patchData, "adapterType") ||
      Object.prototype.hasOwnProperty.call(patchData, "adapterConfig");
    if (touchesAdapterConfiguration && requestedAdapterType === "opencode_local") {
      const rawEffectiveAdapterConfig = Object.prototype.hasOwnProperty.call(patchData, "adapterConfig")
        ? (asRecord(patchData.adapterConfig) ?? {})
        : (asRecord(existing.adapterConfig) ?? {});
      const effectiveAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        existing.companyId,
        rawEffectiveAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      await assertAdapterConfigConstraints(
        existing.companyId,
        requestedAdapterType,
        effectiveAdapterConfig,
      );
    }

    const actor = getActorInfo(req);
    const agent = await svc.update(id, patchData, {
      recordRevision: {
        createdByAgentId: actor.agentId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        source: "patch",
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.updated",
      entityType: "agent",
      entityId: agent.id,
      details: summarizeAgentUpdateDetails(patchData),
    });

    res.json(agent);
  });

  router.post("/agents/:id/pause", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.pause(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Send response immediately so UI updates, then do side effects
    res.json(agent);

    try { await heartbeat.cancelActiveForAgent(id); } catch (err) {
      console.error("Failed to cancel active runs after pause:", err);
    }
    try {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "agent.paused",
        entityType: "agent",
        entityId: agent.id,
      });
    } catch (err) {
      console.error("Failed to log pause activity:", err);
    }
  });

  router.post("/agents/:id/resume", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.resume(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Send response immediately so UI updates
    res.json(agent);

    try {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "agent.resumed",
        entityType: "agent",
        entityId: agent.id,
      });
    } catch (err) {
      console.error("Failed to log resume activity:", err);
    }
  });

  router.post("/agents/:id/terminate", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.terminate(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.terminated",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.delete("/agents/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.remove(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.deleted",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json({ ok: true });
  });

  router.get("/agents/:id/keys", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const keys = await svc.listKeys(id);
    res.json(keys);
  });

  router.post("/agents/:id/keys", validate(createAgentKeySchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const key = await svc.createApiKey(id, req.body.name);

    const agent = await svc.getById(id);
    if (agent) {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "agent.key_created",
        entityType: "agent",
        entityId: agent.id,
        details: { keyId: key.id, name: key.name },
      });
    }

    res.status(201).json(key);
  });

  router.delete("/agents/:id/keys/:keyId", async (req, res) => {
    assertBoard(req);
    const keyId = req.params.keyId as string;
    const revoked = await svc.revokeKey(keyId);
    if (!revoked) {
      res.status(404).json({ error: "Key not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/agents/:id/wakeup", validate(wakeAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.wakeup(id, {
      source: req.body.source,
      triggerDetail: req.body.triggerDetail ?? "manual",
      reason: req.body.reason ?? null,
      payload: req.body.payload ?? null,
      idempotencyKey: req.body.idempotencyKey ?? null,
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      contextSnapshot: {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
      },
    });

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/heartbeat/invoke", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.invoke(
      id,
      "on_demand",
      {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
      },
      "manual",
      {
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      },
    );

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/claude-login", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);
    if (agent.adapterType !== "claude_local") {
      res.status(400).json({ error: "Login is only supported for claude_local agents" });
      return;
    }

    const config = asRecord(agent.adapterConfig) ?? {};
    const runtimeConfig = await secretsSvc.resolveAdapterConfigForRuntime(agent.companyId, config);
    const result = await runClaudeLogin({
      runId: `claude-login-${randomUUID()}`,
      agent: {
        id: agent.id,
        companyId: agent.companyId,
        name: agent.name,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig,
      },
      config: runtimeConfig,
    });

    res.json(result);
  });

  router.get("/companies/:companyId/heartbeat-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.query.agentId as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 200)) : undefined;
    const runs = await heartbeat.list(companyId, agentId, limit);
    res.json(runs);
  });

  router.get("/companies/:companyId/live-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const minCountParam = req.query.minCount as string | undefined;
    const minCount = minCountParam ? Math.max(0, Math.min(20, parseInt(minCountParam, 10) || 0)) : 0;

    const columns = {
      id: heartbeatRuns.id,
      status: heartbeatRuns.status,
      invocationSource: heartbeatRuns.invocationSource,
      triggerDetail: heartbeatRuns.triggerDetail,
      startedAt: heartbeatRuns.startedAt,
      finishedAt: heartbeatRuns.finishedAt,
      createdAt: heartbeatRuns.createdAt,
      agentId: heartbeatRuns.agentId,
      agentName: agentsTable.name,
      adapterType: agentsTable.adapterType,
      issueId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`.as("issueId"),
    };

    const liveRuns = await db
      .select(columns)
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    if (minCount > 0 && liveRuns.length < minCount) {
      const activeIds = liveRuns.map((r) => r.id);
      const recentRuns = await db
        .select(columns)
        .from(heartbeatRuns)
        .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            not(inArray(heartbeatRuns.status, ["queued", "running"])),
            ...(activeIds.length > 0 ? [not(inArray(heartbeatRuns.id, activeIds))] : []),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(minCount - liveRuns.length);

      res.json([...liveRuns, ...recentRuns]);
      return;
    }

    res.json(liveRuns);
  });

  router.post("/heartbeat-runs/:runId/cancel", async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const run = await heartbeat.cancelRun(runId);

    if (run) {
      await logActivity(db, {
        companyId: run.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "heartbeat.cancelled",
        entityType: "heartbeat_run",
        entityId: run.id,
        details: { agentId: run.agentId },
      });
    }

    res.json(run);
  });

  router.get("/heartbeat-runs/:runId/events", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);

    const afterSeq = Number(req.query.afterSeq ?? 0);
    const limit = Number(req.query.limit ?? 200);
    const events = await heartbeat.listEvents(runId, Number.isFinite(afterSeq) ? afterSeq : 0, Number.isFinite(limit) ? limit : 200);
    const redactedEvents = events.map((event) => ({
      ...event,
      payload: redactEventPayload(event.payload),
    }));
    res.json(redactedEvents);
  });

  router.get("/heartbeat-runs/:runId/log", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);

    const offset = Number(req.query.offset ?? 0);
    const limitBytes = Number(req.query.limitBytes ?? 256000);
    const result = await heartbeat.readLog(runId, {
      offset: Number.isFinite(offset) ? offset : 0,
      limitBytes: Number.isFinite(limitBytes) ? limitBytes : 256000,
    });

    res.json(result);
  });

  router.get("/issues/:issueId/live-runs", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const isIdentifier = /^[A-Z]+-\d+$/i.test(rawId);
    const issue = isIdentifier ? await issueSvc.getByIdentifier(rawId) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    const liveRuns = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: heartbeatRuns.triggerDetail,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        createdAt: heartbeatRuns.createdAt,
        agentId: heartbeatRuns.agentId,
        agentName: agentsTable.name,
        adapterType: agentsTable.adapterType,
      })
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, issue.companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
          sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    res.json(liveRuns);
  });

  router.get("/issues/:issueId/active-run", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const isIdentifier = /^[A-Z]+-\d+$/i.test(rawId);
    const issue = isIdentifier ? await issueSvc.getByIdentifier(rawId) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    let run = issue.executionRunId ? await heartbeat.getRun(issue.executionRunId) : null;
    if (run && run.status !== "queued" && run.status !== "running") {
      run = null;
    }

    if (!run && issue.assigneeAgentId && issue.status === "in_progress") {
      const candidateRun = await heartbeat.getActiveRunForAgent(issue.assigneeAgentId);
      const candidateContext = asRecord(candidateRun?.contextSnapshot);
      const candidateIssueId = asNonEmptyString(candidateContext?.issueId);
      if (candidateRun && candidateIssueId === issue.id) {
        run = candidateRun;
      }
    }
    if (!run) {
      res.json(null);
      return;
    }

    const agent = await svc.getById(run.agentId);
    if (!agent) {
      res.json(null);
      return;
    }

    res.json({
      ...run,
      agentId: agent.id,
      agentName: agent.name,
      adapterType: agent.adapterType,
    });
  });

  // ── Bulk adapter switch ─────────────────────────────────────────────────────
  // POST /companies/:companyId/agents/bulk-switch-adapter
  // Body: { adapterType: "cursor" | "codex_local" | ... }
  // Switches ALL non-terminated agents in the company to the given adapter type.
  router.post("/companies/:companyId/agents/bulk-switch-adapter", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { adapterType, model: requestedModel } = req.body as { adapterType?: string; model?: string };
    if (!adapterType || typeof adapterType !== "string") {
      res.status(422).json({ error: "adapterType is required" });
      return;
    }

    const { AGENT_ADAPTER_TYPES } = await import("@paperclipai/shared");
    if (!AGENT_ADAPTER_TYPES.includes(adapterType as any)) {
      res.status(422).json({ error: `Invalid adapterType: ${adapterType}` });
      return;
    }

    // Use explicit model if provided, otherwise fall back to adapter default.
    const defaultModelByAdapter: Record<string, string> = {
      cursor: "auto",
      codex_local: "gpt-5.3-codex",
      claude_local: "claude-sonnet-4-5-20250929",
      opencode_local: "auto",
      pi_local: "auto",
    };
    const effectiveModel = (typeof requestedModel === "string" && requestedModel) || defaultModelByAdapter[adapterType] || "auto";

    const modelJson = JSON.stringify(effectiveModel); // e.g. '"gpt-5.3-codex"'
    // Use CASE to handle agents whose adapter_config is not a JSON object
    // (null, scalar, or empty). In those cases, build a fresh object.
    const result = await db.execute<{ id: string; name: string }>(sql`
      UPDATE agents
      SET adapter_type = ${adapterType},
          adapter_config = CASE
            WHEN jsonb_typeof(adapter_config) = 'object'
            THEN jsonb_set(adapter_config, '{model}', ${modelJson}::jsonb)
            ELSE jsonb_build_object('model', ${modelJson}::jsonb)
          END,
          updated_at = now()
      WHERE company_id = ${companyId} AND status != 'terminated'
      RETURNING id, name
    `);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "agents.bulk_adapter_switch",
      entityType: "company",
      entityId: companyId,
      details: { adapterType, model: effectiveModel, agentCount: result.length },
    });

    logger.info(
      { companyId, adapterType, model: effectiveModel, agentCount: result.length },
      "bulk adapter switch completed",
    );

    res.json({ switched: result.length, adapterType, agents: result });
  });

  return router;
}
