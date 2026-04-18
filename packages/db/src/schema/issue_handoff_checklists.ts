import { pgTable, uuid, text, timestamp, boolean, jsonb, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

/**
 * Issue handoff checklist state (backlog 1.5 B3).
 *
 * Design decision: separate table rather than extending the `issues`
 * row so the default issue core behavior is unaffected (D1/D3 non-
 * disruption). Checklist is optional; if no row exists for an issue,
 * advisory mode is implied (noop on transitions).
 *
 * Enforcement levels:
 *   - "advisory"  : UI-only, no transition guard
 *   - "required"  : unchecked items block "resolve/close" on the server
 *
 * Items is a jsonb array of { id, label, checked, checkedAt }.
 */
export const issueHandoffChecklists = pgTable(
  "issue_handoff_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    enforcement: text("enforcement").notNull().default("advisory"),
    items: jsonb("items").notNull().default([]),
    lastUpdatedByUserId: text("last_updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueUq: unique("issue_handoff_checklists_issue_uq").on(table.issueId),
    companyIdx: index("issue_handoff_checklists_company_idx").on(table.companyId),
  }),
);

export interface HandoffChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
  checkedByUserId?: string | null;
}

export const HANDOFF_DEFAULT_ITEMS: HandoffChecklistItem[] = [
  { id: "reviewed_latest_version", label: "Reviewed latest version of evidence files", checked: false, checkedAt: null },
  { id: "compared_prior_version", label: "Compared against prior version (diff)", checked: false, checkedAt: null },
  { id: "included_summary", label: "Included summary artifact", checked: false, checkedAt: null },
  { id: "validated_with_run", label: "Validated with latest run output", checked: false, checkedAt: null },
];
