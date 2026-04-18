import { and, eq, desc, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues, issueComments } from "@paperclipai/db";
import type { PapeeChatResponse, PapeeAction } from "@paperclipai/shared";
import { dashboardService } from "./dashboard.js";