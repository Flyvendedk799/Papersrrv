import type { Db } from "@paperclipai/db";
import { agentMessages } from "@paperclipai/db";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { publishLiveEvent } from "./live-events.js";
import { logger } from "../middleware/logger.js";

export function agentMessagingService(db: Db) {
  return {
    async send(input: {
      companyId: string;
      fromAgentId: string;
      toAgentId: string;
      body: string;
      subject?: string;
      channel?: string;
      metadata?: Record<string, unknown>;
    }) {
      const [msg] = await db.insert(agentMessages).values({
        companyId: input.companyId,
        fromAgentId: input.fromAgentId,
        toAgentId: input.toAgentId,
        body: input.body,
        subject: input.subject,
        channel: input.channel ?? "direct",
        metadata: input.metadata ?? {},
      }).returning();

      publishLiveEvent({
        companyId: input.companyId,
        type: "agent.status",
        payload: { kind: "message", messageId: msg.id, fromAgentId: input.fromAgentId, toAgentId: input.toAgentId },
      });

      logger.debug({ messageId: msg.id, from: input.fromAgentId, to: input.toAgentId }, "agent-messaging: sent");
      return msg;
    },

    async inbox(agentId: string, opts?: { unreadOnly?: boolean; limit?: number }) {
      const conditions = [eq(agentMessages.toAgentId, agentId)];
      if (opts?.unreadOnly) conditions.push(isNull(agentMessages.readAt));
      return db.select().from(agentMessages)
        .where(and(...conditions))
        .orderBy(desc(agentMessages.createdAt))
        .limit(opts?.limit ?? 50);
    },

    async markRead(messageId: string, agentId: string) {
      const [updated] = await db.update(agentMessages)
        .set({ readAt: new Date() })
        .where(and(eq(agentMessages.id, messageId), eq(agentMessages.toAgentId, agentId)))
        .returning();
      return updated ?? null;
    },

    async conversation(agentAId: string, agentBId: string, limit = 50) {
      return db.select().from(agentMessages)
        .where(sql`
          (${agentMessages.fromAgentId} = ${agentAId} AND ${agentMessages.toAgentId} = ${agentBId})
          OR (${agentMessages.fromAgentId} = ${agentBId} AND ${agentMessages.toAgentId} = ${agentAId})
        `)
        .orderBy(desc(agentMessages.createdAt))
        .limit(limit);
    },

    async broadcast(companyId: string, fromAgentId: string, body: string, subject?: string) {
      const { agents } = await import("@paperclipai/db");
      const { ne } = await import("drizzle-orm");
      const companyAgents = await db.select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), ne(agents.id, fromAgentId), ne(agents.status, "terminated")));

      const messages = companyAgents.map(a => ({
        companyId, fromAgentId, toAgentId: a.id,
        body, subject, channel: "broadcast" as const,
      }));

      if (messages.length > 0) {
        await db.insert(agentMessages).values(messages);
      }
      return { sent: messages.length };
    },

    async unreadCount(agentId: string) {
      const [row] = await db.select({ count: sql<number>`count(*)::int` })
        .from(agentMessages)
        .where(and(eq(agentMessages.toAgentId, agentId), isNull(agentMessages.readAt)));
      return row?.count ?? 0;
    },
  };
}
