import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  SECRET_PROVIDERS,
  type SecretProvider,
  createSecretSchema,
  rotateSecretSchema,
  updateSecretSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity, secretService } from "../services/index.js";

export function secretRoutes(db: Db) {
  const router = Router();
  const svc = secretService(db);
  const configuredDefaultProvider = process.env.PAPERCLIP_SECRETS_PROVIDER;
  const defaultProvider = (
    configuredDefaultProvider && SECRET_PROVIDERS.includes(configuredDefaultProvider as SecretProvider)
      ? configuredDefaultProvider
      : "local_encrypted"
  ) as SecretProvider;

  router.get("/companies/:companyId/secret-providers", (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(svc.listProviders());
  });

  router.get("/companies/:companyId/secrets", async (req, res) => {
    // Allow both board and agent callers — agents need to discover secrets to grant them
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const secrets = await svc.list(companyId);
    res.json(secrets);
  });

  router.post("/companies/:companyId/secrets", validate(createSecretSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const created = await svc.create(
      companyId,
      {
        name: req.body.name,
        provider: req.body.provider ?? defaultProvider,
        value: req.body.value,
        description: req.body.description,
        externalRef: req.body.externalRef,
      },
      { userId: req.actor.userId ?? "board", agentId: null },
    );

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.created",
      entityType: "secret",
      entityId: created.id,
      details: { name: created.name, provider: created.provider },
    });

    res.status(201).json(created);
  });

  router.post("/secrets/:id/rotate", validate(rotateSecretSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const rotated = await svc.rotate(
      id,
      {
        value: req.body.value,
        externalRef: req.body.externalRef,
      },
      { userId: req.actor.userId ?? "board", agentId: null },
    );

    await logActivity(db, {
      companyId: rotated.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.rotated",
      entityType: "secret",
      entityId: rotated.id,
      details: { version: rotated.latestVersion },
    });

    res.json(rotated);
  });

  router.patch("/secrets/:id", validate(updateSecretSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const updated = await svc.update(id, {
      name: req.body.name,
      description: req.body.description,
      externalRef: req.body.externalRef,
    });

    if (!updated) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.updated",
      entityType: "secret",
      entityId: updated.id,
      details: { name: updated.name },
    });

    res.json(updated);
  });

  router.delete("/secrets/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const removed = await svc.remove(id);
    if (!removed) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }

    await logActivity(db, {
      companyId: removed.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.deleted",
      entityType: "secret",
      entityId: removed.id,
      details: { name: removed.name },
    });

    res.json({ ok: true });
  });

  // --------------- Secret usage: which agents reference each secret ---------------

  router.get("/companies/:companyId/secret-usage", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const allAgents = await db
      .select({
        id: agentsTable.id,
        name: agentsTable.name,
        status: agentsTable.status,
        adapterConfig: agentsTable.adapterConfig,
      })
      .from(agentsTable)
      .where(eq(agentsTable.companyId, companyId));

    // Build a map: secretId -> [{ agentId, agentName, agentStatus, envKey }]
    const usage: Record<string, { agentId: string; agentName: string; agentStatus: string; envKey: string }[]> = {};

    for (const agent of allAgents) {
      const env = (agent.adapterConfig as Record<string, unknown>)?.env;
      if (!env || typeof env !== "object") continue;
      for (const [envKey, binding] of Object.entries(env as Record<string, unknown>)) {
        if (
          typeof binding === "object" &&
          binding !== null &&
          (binding as Record<string, unknown>).type === "secret_ref"
        ) {
          const secretId = (binding as Record<string, unknown>).secretId as string;
          if (!secretId) continue;
          if (!usage[secretId]) usage[secretId] = [];
          usage[secretId].push({
            agentId: agent.id,
            agentName: agent.name,
            agentStatus: agent.status,
            envKey,
          });
        }
      }
    }

    res.json(usage);
  });

  // --------------- Grant: assign a secret to an agent's env config ---------------
  // Accessible by board users AND authenticated agents (agents need this to unblock peers)

  router.post("/secrets/:id/grant", async (req, res) => {
    // Allow both board and agent callers — company access checked after loading the secret
    const secretId = req.params.id as string;
    const { agentId, envKey } = req.body as { agentId?: string; envKey?: string };

    if (!agentId || !envKey) {
      res.status(400).json({ error: "agentId and envKey are required" });
      return;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)) {
      res.status(400).json({ error: "Invalid environment variable name" });
      return;
    }

    const secret = await svc.getById(secretId);
    if (!secret) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    assertCompanyAccess(req, secret.companyId);

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, agentId));

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.companyId !== secret.companyId) {
      res.status(400).json({ error: "Agent and secret must belong to the same company" });
      return;
    }

    const config = { ...(agent.adapterConfig as Record<string, unknown>) };
    const env = { ...((config.env as Record<string, unknown>) ?? {}) };
    env[envKey] = { type: "secret_ref", secretId, version: "latest" };
    config.env = env;

    await db
      .update(agentsTable)
      .set({ adapterConfig: config, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    await logActivity(db, {
      companyId: secret.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? (req.actor.agentId ?? "unknown-agent") : (req.actor.userId ?? "board"),
      action: "secret.granted",
      entityType: "secret",
      entityId: secret.id,
      details: { agentId, agentName: agent.name, envKey, secretName: secret.name },
    });

    res.json({ ok: true, agentId, envKey, secretId });
  });

  // --------------- Revoke: remove a secret binding from an agent's env config ---------------

  router.post("/secrets/:id/revoke", async (req, res) => {
    assertBoard(req);  // Revoke stays board-only for safety
    const secretId = req.params.id as string;
    const { agentId, envKey } = req.body as { agentId?: string; envKey?: string };

    if (!agentId || !envKey) {
      res.status(400).json({ error: "agentId and envKey are required" });
      return;
    }

    const secret = await svc.getById(secretId);
    if (!secret) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    assertCompanyAccess(req, secret.companyId);

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, agentId));

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const config = { ...(agent.adapterConfig as Record<string, unknown>) };
    const env = { ...((config.env as Record<string, unknown>) ?? {}) };
    delete env[envKey];
    config.env = env;

    await db
      .update(agentsTable)
      .set({ adapterConfig: config, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    await logActivity(db, {
      companyId: secret.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.revoked",
      entityType: "secret",
      entityId: secret.id,
      details: { agentId, agentName: agent.name, envKey, secretName: secret.name },
    });

    res.json({ ok: true, agentId, envKey, secretId });
  });

  return router;
}
