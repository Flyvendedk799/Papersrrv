/**
 * GitHub connections service (backlog 4.0 A1).
 *
 * Foundation phase: stores PATs via the existing secret vault
 * (`company_secrets`) and keeps a thin `github_connections` row that
 * references the secret id. Raw tokens never land on a github table.
 *
 * Secure-hook integration point: `resolveToken()` is the single place
 * that reads plaintext — callers (the github client factory) must only
 * invoke this with full company access checks in place. If a future
 * secret backend requires an HSM/KMS hook, replace the call to
 * `secretService.resolveEnvBindings` with a backend-specific resolver
 * and keep the surface area to one function.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { githubConnections, companySecrets } from "@paperclipai/db";
import type {
  GithubConnection,
  GithubConnectionAuthType,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { secretService } from "./secrets.js";

const GITHUB_PAT_SECRET_PREFIX = "github_pat";

function toGithubConnection(row: typeof githubConnections.$inferSelect): GithubConnection {
  return {
    id: row.id,
    companyId: row.companyId,
    authType: row.authType as GithubConnectionAuthType,
    secretId: row.secretId,
    accountLogin: row.accountLogin,
    scopesHint: row.scopesHint,
    metadata: row.metadata,
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export function githubConnectionsService(db: Db) {
  const secrets = secretService(db);

  async function list(companyId: string): Promise<GithubConnection[]> {
    const rows = await db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.companyId, companyId))
      .orderBy(desc(githubConnections.createdAt));
    return rows.map(toGithubConnection);
  }

  async function getById(id: string): Promise<GithubConnection | null> {
    const rows = await db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, id));
    return rows[0] ? toGithubConnection(rows[0]) : null;
  }

  async function resolveToken(connectionId: string, companyId: string): Promise<string> {
    const rows = await db
      .select()
      .from(githubConnections)
      .where(
        and(
          eq(githubConnections.id, connectionId),
          eq(githubConnections.companyId, companyId),
        ),
      );
    const conn = rows[0];
    if (!conn) throw notFound("GitHub connection not found");
    if (!conn.secretId) {
      throw notFound("GitHub connection has no token; reconnect required");
    }
    // Reuse the existing vault's resolver. The token is stored as a
    // single plain value in the secret record.
    const resolved = await secrets.resolveEnvBindings(companyId, {
      TOKEN: { type: "secret_ref", secretId: conn.secretId, version: "latest" },
    });
    const token = resolved.TOKEN;
    if (!token) throw notFound("GitHub connection token is no longer available");
    return token;
  }

  async function createPatConnection(
    companyId: string,
    input: {
      token: string;
      accountLogin?: string | null;
      description?: string | null;
    },
    actor: { userId?: string | null; agentId?: string | null },
  ): Promise<GithubConnection> {
    const accountLogin = (input.accountLogin ?? "default").toLowerCase();
    // Unique secret name per (company, connection). We may add multiple
    // connections per account later (e.g. per repo), so include an
    // incrementing suffix based on time.
    const secretName = `${GITHUB_PAT_SECRET_PREFIX}/${accountLogin}/${Date.now()}`;

    const secret = await secrets.create(
      companyId,
      {
        name: secretName,
        provider: "local_encrypted",
        value: input.token,
        description: input.description ?? `GitHub PAT for ${accountLogin}`,
      },
      { userId: actor.userId ?? null, agentId: actor.agentId ?? null },
    );

    const [inserted] = await db
      .insert(githubConnections)
      .values({
        companyId,
        authType: "pat",
        secretId: secret.id,
        accountLogin,
        scopesHint: null,
        metadata: {},
        createdByUserId: actor.userId ?? null,
      })
      .returning();

    return toGithubConnection(inserted);
  }

  async function remove(id: string): Promise<GithubConnection | null> {
    const rows = await db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, id));
    const row = rows[0];
    if (!row) return null;

    await db.delete(githubConnections).where(eq(githubConnections.id, id));
    // Best-effort secret cleanup. The ON DELETE SET NULL keeps the row
    // deletable even if the secret has already been removed.
    if (row.secretId) {
      try {
        await secrets.remove(row.secretId);
      } catch {
        // Ignore — the connection is already gone, which is the primary
        // invariant. Orphan secret (if any) is visible in the secrets UI.
      }
    }
    return toGithubConnection(row);
  }

  async function markVerified(id: string): Promise<void> {
    await db
      .update(githubConnections)
      .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(githubConnections.id, id));
  }

  return {
    list,
    getById,
    resolveToken,
    createPatConnection,
    remove,
    markVerified,
  };
}

export { toGithubConnection };
