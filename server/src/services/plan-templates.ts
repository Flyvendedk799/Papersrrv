/**
 * Plan templates service (F10).
 *
 * Thin CRUD surface over `plan_templates`. Instantiation (applying
 * variables to produce a concrete PlanOutput) lives in
 * instantiatePlanTemplate below so callers can produce a plan
 * without round-tripping through the DB.
 */

import { and, eq, asc, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { planTemplates, type PlanTemplateRow } from "@paperclipai/db";
import {
  planOutputSchema,
  type PlanOutput,
  type PlanTemplate,
  type PlanTemplateVariable,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

function toApi(row: PlanTemplateRow): PlanTemplate {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description ?? null,
    planOutputJson: row.planOutputJson ?? null,
    variables: (row.variables as PlanTemplateVariable[] | null) ?? null,
    createdByAgentId: row.createdByAgentId ?? null,
    createdByUserId: row.createdByUserId ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function planTemplateService(db: Db) {
  return {
    async list(companyId: string, includeArchived = false): Promise<PlanTemplate[]> {
      const rows = await db
        .select()
        .from(planTemplates)
        .where(eq(planTemplates.companyId, companyId))
        .orderBy(asc(planTemplates.name));
      return rows
        .filter((r) => includeArchived || !r.archivedAt)
        .map(toApi);
    },
    async get(companyId: string, id: string): Promise<PlanTemplate | null> {
      const row = await db
        .select()
        .from(planTemplates)
        .where(and(eq(planTemplates.companyId, companyId), eq(planTemplates.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      return row ? toApi(row) : null;
    },
    async create(
      companyId: string,
      input: {
        name: string;
        description?: string | null;
        planOutput: unknown;
        variables?: PlanTemplateVariable[] | null;
      },
      actor: { userId: string | null; agentId: string | null },
    ): Promise<PlanTemplate> {
      const name = (input.name ?? "").trim();
      if (!name) throw unprocessable("name is required");
      const parsed = planOutputSchema.safeParse(input.planOutput);
      if (!parsed.success) {
        throw unprocessable("planOutput does not match the PlanOutput schema");
      }
      const [row] = await db
        .insert(planTemplates)
        .values({
          companyId,
          name,
          description: input.description ?? null,
          planOutputJson: parsed.data,
          variables: input.variables ?? null,
          createdByUserId: actor.userId,
          createdByAgentId: actor.agentId,
        })
        .returning();
      return toApi(row);
    },
    async remove(companyId: string, id: string): Promise<void> {
      const row = await db
        .select({ id: planTemplates.id })
        .from(planTemplates)
        .where(and(eq(planTemplates.companyId, companyId), eq(planTemplates.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!row) throw notFound("Template not found");
      await db
        .update(planTemplates)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(planTemplates.id, id));
    },
  };
}

/**
 * Substitute {var} placeholders in every string field of a
 * PlanOutput using the given values. Unknown vars remain in place
 * (so the user can see what didn't resolve).
 */
export function instantiatePlanTemplate(
  template: PlanOutput,
  values: Record<string, string>,
): PlanOutput {
  const substitute = (s: string) =>
    s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? values[name] ?? "" : match,
    );

  return {
    ...template,
    summary: substitute(template.summary),
    context: substitute(template.context),
    proposedSteps: template.proposedSteps.map((s) => ({
      ...s,
      title: substitute(s.title),
      detail: substitute(s.detail),
    })),
    risks: template.risks?.map(substitute),
    openQuestions: template.openQuestions?.map(substitute),
    delegations: template.delegations?.map((d) => ({
      agent: substitute(d.agent),
      task: substitute(d.task),
    })),
  };
}
