import type { Db } from "@paperclipai/db";
import { companySecrets, companySecretVersions } from "@paperclipai/db";
import { and, eq, lt, desc, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

const DEFAULT_ROTATION_DAYS = 90;

export function secretRotationService(db: Db) {
  return {
    /** Find secrets that are due for rotation */
    async findSecretsNeedingRotation(companyId: string, maxAgeDays = DEFAULT_ROTATION_DAYS) {
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      // Get the latest version date for each secret
      const secretsWithAge = await db
        .select({
          secretId: companySecrets.id,
          secretName: companySecrets.name,
          lastRotatedAt: sql<Date>`(
            SELECT MAX(${companySecretVersions.createdAt})
            FROM ${companySecretVersions}
            WHERE ${companySecretVersions.secretId} = ${companySecrets.id}
          )`,
        })
        .from(companySecrets)
        .where(eq(companySecrets.companyId, companyId));

      return secretsWithAge
        .filter(s => !s.lastRotatedAt || s.lastRotatedAt < cutoff)
        .map(s => ({
          ...s,
          daysSinceRotation: s.lastRotatedAt
            ? Math.floor((Date.now() - new Date(s.lastRotatedAt).getTime()) / (24 * 60 * 60 * 1000))
            : null,
          needsRotation: true,
        }));
    },

    /** Get rotation status for all secrets in a company */
    async rotationStatus(companyId: string) {
      const secrets = await db
        .select({
          id: companySecrets.id,
          name: companySecrets.name,
          createdAt: companySecrets.createdAt,
          versionCount: sql<number>`(
            SELECT count(*)::int FROM ${companySecretVersions}
            WHERE ${companySecretVersions.secretId} = ${companySecrets.id}
          )`,
          lastRotatedAt: sql<Date | null>`(
            SELECT MAX(${companySecretVersions.createdAt})
            FROM ${companySecretVersions}
            WHERE ${companySecretVersions.secretId} = ${companySecrets.id}
          )`,
        })
        .from(companySecrets)
        .where(eq(companySecrets.companyId, companyId));

      return secrets.map(s => {
        const daysSince = s.lastRotatedAt
          ? Math.floor((Date.now() - new Date(s.lastRotatedAt).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          ...s,
          daysSinceRotation: daysSince,
          rotationStatus: daysSince === null ? "unknown" : daysSince > DEFAULT_ROTATION_DAYS ? "overdue" : daysSince > DEFAULT_ROTATION_DAYS * 0.8 ? "due_soon" : "ok",
        };
      });
    },
  };
}
