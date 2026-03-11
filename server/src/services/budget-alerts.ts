import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, costEvents } from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";
import { logger } from "../middleware/logger.js";

export interface BudgetAlert {
  agentId: string;
  agentName: string;
  companyId: string;
  spentCents: number;
  budgetCents: number;
  utilizationPercent: number;
  severity: "warning" | "critical";
}

const WARNING_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 0.95;

export function budgetAlertService(db: Db) {
  function startOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  async function checkBudgetThresholds(companyId: string): Promise<BudgetAlert[]> {
    const companyAgents = await db
      .select({
        id: agents.id,
        name: agents.name,
        companyId: agents.companyId,
        budgetMonthlyCents: agents.budgetMonthlyCents,
        status: agents.status,
      })
      .from(agents)
      .where(
        and(
          eq(agents.companyId, companyId),
          ne(agents.status, "terminated"),
        ),
      );

    const agentsWithBudget = companyAgents.filter(
      (a: { budgetMonthlyCents: number }) => a.budgetMonthlyCents > 0,
    );

    if (agentsWithBudget.length === 0) return [];

    const monthStart = startOfCurrentMonth();
    const alerts: BudgetAlert[] = [];

    for (const agent of agentsWithBudget) {
      const [{ total }] = await db
        .select({
          total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            eq(costEvents.agentId, agent.id),
            gte(costEvents.occurredAt, monthStart),
          ),
        );

      const spentCents = Number(total);
      const utilization = spentCents / agent.budgetMonthlyCents;

      if (utilization >= CRITICAL_THRESHOLD) {
        const alert: BudgetAlert = {
          agentId: agent.id,
          agentName: agent.name,
          companyId,
          spentCents,
          budgetCents: agent.budgetMonthlyCents,
          utilizationPercent: Number((utilization * 100).toFixed(2)),
          severity: "critical",
        };
        alerts.push(alert);

        publishLiveEvent({
          companyId,
          type: "agent.status",
          payload: {
            agentId: agent.id,
            agentName: agent.name,
            kind: "budget_alert",
            severity: "critical",
            spentCents,
            budgetCents: agent.budgetMonthlyCents,
            utilizationPercent: alert.utilizationPercent,
            message: `Agent "${agent.name}" has used ${alert.utilizationPercent}% of its monthly budget ($${(spentCents / 100).toFixed(2)} / $${(agent.budgetMonthlyCents / 100).toFixed(2)})`,
          },
        });

        logger.warn(
          { agentId: agent.id, agentName: agent.name, utilization: alert.utilizationPercent },
          "Budget CRITICAL: agent near budget cap",
        );
      } else if (utilization >= WARNING_THRESHOLD) {
        const alert: BudgetAlert = {
          agentId: agent.id,
          agentName: agent.name,
          companyId,
          spentCents,
          budgetCents: agent.budgetMonthlyCents,
          utilizationPercent: Number((utilization * 100).toFixed(2)),
          severity: "warning",
        };
        alerts.push(alert);

        publishLiveEvent({
          companyId,
          type: "agent.status",
          payload: {
            agentId: agent.id,
            agentName: agent.name,
            kind: "budget_alert",
            severity: "warning",
            spentCents,
            budgetCents: agent.budgetMonthlyCents,
            utilizationPercent: alert.utilizationPercent,
            message: `Agent "${agent.name}" has used ${alert.utilizationPercent}% of its monthly budget ($${(spentCents / 100).toFixed(2)} / $${(agent.budgetMonthlyCents / 100).toFixed(2)})`,
          },
        });

        logger.warn(
          { agentId: agent.id, agentName: agent.name, utilization: alert.utilizationPercent },
          "Budget WARNING: agent approaching budget cap",
        );
      }
    }

    return alerts;
  }

  async function checkAllCompanies(): Promise<BudgetAlert[]> {
    const allCompanies = await db
      .select({ id: companies.id })
      .from(companies);

    const allAlerts: BudgetAlert[] = [];

    for (const company of allCompanies) {
      try {
        const alerts = await checkBudgetThresholds(company.id);
        allAlerts.push(...alerts);
      } catch (err) {
        logger.error({ companyId: company.id, err }, "Failed to check budget thresholds for company");
      }
    }

    return allAlerts;
  }

  return {
    checkBudgetThresholds,
    checkAllCompanies,
  };
}
