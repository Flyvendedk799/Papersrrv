import type { Db } from "@paperclipai/db";
import { knowledgeBaseEntries } from "@paperclipai/db";
import { and, eq, desc, sql, or } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

export function knowledgeBaseService(db: Db) {
  return {
    async create(input: {
      companyId: string;
      createdByAgentId?: string;
      title: string;
      content: string;
      category?: string;
      tags?: string[];
      visibility?: string;
    }) {
      const [entry] = await db.insert(knowledgeBaseEntries).values({
        companyId: input.companyId,
        createdByAgentId: input.createdByAgentId ?? null,
        title: input.title,
        content: input.content,
        category: input.category ?? "general",
        tags: input.tags ?? [],
        visibility: input.visibility ?? "company",
      }).returning();
      return entry;
    },

    async list(companyId: string, opts?: { category?: string; search?: string; limit?: number }) {
      const conditions = [eq(knowledgeBaseEntries.companyId, companyId)];
      if (opts?.category) conditions.push(eq(knowledgeBaseEntries.category, opts.category));
      if (opts?.search) {
        const pattern = `%${opts.search.replace(/[%_]/g, "\\$&")}%`;
        conditions.push(or(
          sql`${knowledgeBaseEntries.title} ILIKE ${pattern} ESCAPE '\\'`,
          sql`${knowledgeBaseEntries.content} ILIKE ${pattern} ESCAPE '\\'`,
        )!);
      }
      return db.select().from(knowledgeBaseEntries)
        .where(and(...conditions))
        .orderBy(desc(knowledgeBaseEntries.updatedAt))
        .limit(opts?.limit ?? 50);
    },

    async getById(id: string) {
      return db.select().from(knowledgeBaseEntries)
        .where(eq(knowledgeBaseEntries.id, id))
        .then(rows => rows[0] ?? null);
    },

    async update(id: string, data: { title?: string; content?: string; category?: string; tags?: string[] }) {
      const [updated] = await db.update(knowledgeBaseEntries)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(knowledgeBaseEntries.id, id))
        .returning();
      return updated ?? null;
    },

    async remove(id: string) {
      await db.delete(knowledgeBaseEntries).where(eq(knowledgeBaseEntries.id, id));
    },

    /** Search knowledge base for an agent - includes company-wide and agent-specific entries */
    async searchForAgent(companyId: string, agentId: string, query: string, limit = 10) {
      const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      return db.select().from(knowledgeBaseEntries)
        .where(and(
          eq(knowledgeBaseEntries.companyId, companyId),
          or(
            eq(knowledgeBaseEntries.visibility, "company"),
            and(eq(knowledgeBaseEntries.visibility, "private"), eq(knowledgeBaseEntries.createdByAgentId, agentId)),
          )!,
          or(
            sql`${knowledgeBaseEntries.title} ILIKE ${pattern} ESCAPE '\\'`,
            sql`${knowledgeBaseEntries.content} ILIKE ${pattern} ESCAPE '\\'`,
          )!,
        ))
        .orderBy(desc(knowledgeBaseEntries.updatedAt))
        .limit(limit);
    },
  };
}
