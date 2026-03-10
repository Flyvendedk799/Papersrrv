import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { fileContents } from "./file_contents.js";

export const agentFileSnapshots = pgTable(
  "agent_file_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    runId: uuid("run_id").notNull().references(() => heartbeatRuns.id),
    filePath: text("file_path").notNull(),
    contentHash: text("content_hash").references(() => fileContents.hash),
    operation: text("operation").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pathIdx: index("idx_snapshots_path").on(table.companyId, table.filePath),
    runIdx: index("idx_snapshots_run").on(table.runId),
    agentIdx: index("idx_snapshots_agent").on(table.companyId, table.agentId),
  }),
);
