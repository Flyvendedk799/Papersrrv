import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySecrets } from "./company_secrets.js";

/**
 * GitHub connections (backlog 4.0 A1) — company-scoped auth bindings.
 *
 * Foundation-phase decision: PAT-first. The raw token is stored as a
 * `company_secrets` row (reusing the existing encrypted vault); this
 * row keeps only the metadata + a reference to the secret id.
 *
 * GitHub App installation auth is represented by the same table with
 * `authType = 'github_app'` (deferred — schema reserved for future).
 */
export const githubConnections = pgTable(
  "github_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // "pat" | "github_app"
    authType: text("auth_type").notNull().default("pat"),
    // FK to company_secrets for PAT storage. Nullable so app-install rows
    // (future) can represent installation ids via metadata instead.
    secretId: uuid("secret_id").references(() => companySecrets.id, {
      onDelete: "set null",
    }),
    // GitHub account login this PAT belongs to (owner / organization).
    accountLogin: text("account_login"),
    // Advisory list of scopes the connection believes it has.
    scopesHint: text("scopes_hint"),
    // Free-form JSON for app installations, future fields.
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("github_connections_company_idx").on(table.companyId),
    // Only one live connection per (company, accountLogin, authType)
    companyAccountUq: uniqueIndex("github_connections_company_account_uq").on(
      table.companyId,
      table.authType,
      table.accountLogin,
    ),
  }),
);

export type GithubConnectionRow = typeof githubConnections.$inferSelect;
export type NewGithubConnectionRow = typeof githubConnections.$inferInsert;
