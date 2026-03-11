import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companySkills = pgTable(
  "company_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    /** The main SKILL.md content */
    content: text("content").notNull(),
    /** Additional files in the skill folder: { "assets/foo.txt": "contents...", ... } */
    files: jsonb("files").$type<Record<string, string>>().notNull().default({}),
    /** YAML frontmatter parsed as JSON for quick access */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_skills_company_idx").on(table.companyId),
    nameIdx: index("company_skills_company_name_idx").on(table.companyId, table.name),
  }),
);
