import { createHash } from "node:crypto";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentFileSnapshots, fileContents, agents } from "@paperclipai/db";
import type { FileSnapshot, FileContent, FileTreeNode, FileWithHistory } from "@paperclipai/shared";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isMarkdownPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function toSnapshot(
  row: typeof agentFileSnapshots.$inferSelect,
  agentName?: string,
): FileSnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    agentId: row.agentId,
    agentName,
    runId: row.runId,
    filePath: row.filePath,
    contentHash: row.contentHash,
    operation: row.operation,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toFileContent(row: typeof fileContents.$inferSelect): FileContent {
  return {
    hash: row.hash,
    content: row.content,
    size: row.size,
    isMarkdown: row.isMarkdown,
    createdAt: row.createdAt.toISOString(),
  };
}

export function fileService(db: Db) {
  return {
    /**
     * Store file content (CAS deduplication) and create a snapshot record.
     */
    async createSnapshot(
      companyId: string,
      data: {
        agentId: string;
        runId: string;
        filePath: string;
        content?: string;
        operation: string;
      },
    ): Promise<FileSnapshot> {
      let contentHash: string | null = null;

      if (data.content !== undefined && data.operation !== "delete") {
        const hash = sha256(data.content);
        contentHash = hash;

        // CAS: insert only if not already present (conflict-safe)
        await db
          .insert(fileContents)
          .values({
            hash,
            content: data.content,
            size: Buffer.byteLength(data.content, "utf8"),
            isMarkdown: isMarkdownPath(data.filePath),
          })
          .onConflictDoNothing({ target: fileContents.hash });
      }

      const row = await db
        .insert(agentFileSnapshots)
        .values({
          companyId,
          agentId: data.agentId,
          runId: data.runId,
          filePath: data.filePath,
          contentHash,
          operation: data.operation,
        })
        .returning()
        .then((rows) => rows[0]);

      return toSnapshot(row);
    },

    /**
     * Bulk-index files from a completed run transcript.
     */
    async indexRunFiles(
      companyId: string,
      data: {
        agentId: string;
        runId: string;
        files: Array<{ filePath: string; content?: string; operation: string }>;
      },
    ): Promise<number> {
      let indexed = 0;

      for (const file of data.files) {
        let contentHash: string | null = null;

        if (file.content !== undefined && file.operation !== "delete") {
          const hash = sha256(file.content);
          contentHash = hash;

          await db
            .insert(fileContents)
            .values({
              hash,
              content: file.content,
              size: Buffer.byteLength(file.content, "utf8"),
              isMarkdown: isMarkdownPath(file.filePath),
            })
            .onConflictDoNothing({ target: fileContents.hash });
        }

        await db.insert(agentFileSnapshots).values({
          companyId,
          agentId: data.agentId,
          runId: data.runId,
          filePath: file.filePath,
          contentHash,
          operation: file.operation,
        });

        indexed++;
      }

      return indexed;
    },

    /**
     * List unique file paths for a company, with latest snapshot info.
     */
    async listFiles(
      companyId: string,
      filters?: { agentId?: string; runId?: string; search?: string },
    ): Promise<FileWithHistory[]> {
      // Get the latest snapshot per unique file path
      const conditions = [eq(agentFileSnapshots.companyId, companyId)];
      if (filters?.agentId) {
        conditions.push(eq(agentFileSnapshots.agentId, filters.agentId));
      }
      if (filters?.runId) {
        conditions.push(eq(agentFileSnapshots.runId, filters.runId));
      }

      const latestSnapshots = await db
        .select({
          filePath: agentFileSnapshots.filePath,
          id: sql<string>`(array_agg(${agentFileSnapshots.id} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          agentId: sql<string>`(array_agg(${agentFileSnapshots.agentId} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          runId: sql<string>`(array_agg(${agentFileSnapshots.runId} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          contentHash: sql<string | null>`(array_agg(${agentFileSnapshots.contentHash} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          operation: sql<string>`(array_agg(${agentFileSnapshots.operation} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          capturedAt: sql<Date>`(array_agg(${agentFileSnapshots.capturedAt} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1]`,
          snapshotCount: sql<number>`count(*)::int`,
        })
        .from(agentFileSnapshots)
        .where(and(...conditions))
        .groupBy(agentFileSnapshots.filePath)
        .orderBy(sql`(array_agg(${agentFileSnapshots.capturedAt} ORDER BY ${agentFileSnapshots.capturedAt} DESC))[1] DESC`);

      if (latestSnapshots.length === 0) return [];

      // Batch-load agent names
      const agentIds = [...new Set(latestSnapshots.map((r) => r.agentId))];
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(inArray(agents.id, agentIds));
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));

      // Filter by search term if provided
      let results = latestSnapshots;
      if (filters?.search) {
        const term = filters.search.toLowerCase();
        results = results.filter((r) => r.filePath.toLowerCase().includes(term));
      }

      return results.map((r) => ({
        filePath: r.filePath,
        latestSnapshot: {
          id: r.id,
          companyId,
          agentId: r.agentId,
          agentName: agentNameMap.get(r.agentId),
          runId: r.runId,
          filePath: r.filePath,
          contentHash: r.contentHash,
          operation: r.operation,
          capturedAt: r.capturedAt instanceof Date ? r.capturedAt.toISOString() : String(r.capturedAt),
        },
        content: null, // Content loaded on demand
        snapshotCount: r.snapshotCount,
      }));
    },

    /**
     * Get file content by hash, optionally scoped to a company.
     */
    async getContent(hash: string, companyId?: string): Promise<FileContent | null> {
      // When companyId is provided, verify the hash is referenced by a snapshot in that company
      if (companyId) {
        const snapshot = await db
          .select({ id: agentFileSnapshots.id })
          .from(agentFileSnapshots)
          .where(
            and(
              eq(agentFileSnapshots.companyId, companyId),
              eq(agentFileSnapshots.contentHash, hash),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null);
        if (!snapshot) return null;
      }

      const row = await db
        .select()
        .from(fileContents)
        .where(eq(fileContents.hash, hash))
        .then((rows) => rows[0] ?? null);
      return row ? toFileContent(row) : null;
    },

    /**
     * Get all snapshots for a specific file path (history).
     */
    async getFileHistory(
      companyId: string,
      filePath: string,
    ): Promise<FileSnapshot[]> {
      const rows = await db
        .select()
        .from(agentFileSnapshots)
        .where(
          and(
            eq(agentFileSnapshots.companyId, companyId),
            eq(agentFileSnapshots.filePath, filePath),
          ),
        )
        .orderBy(desc(agentFileSnapshots.capturedAt));

      const agentIds = [...new Set(rows.map((r) => r.agentId))];
      const agentRows = agentIds.length > 0
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : [];
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));

      return rows.map((r) => toSnapshot(r, agentNameMap.get(r.agentId)));
    },

    /**
     * Build a file tree from all known file paths.
     */
    async getFileTree(
      companyId: string,
      filters?: { agentId?: string },
    ): Promise<FileTreeNode[]> {
      const files = await this.listFiles(companyId, filters);

      const root: FileTreeNode = { name: "", path: "", type: "directory", children: [] };

      for (const file of files) {
        // Normalize separators (Windows backslashes → forward slashes)
        const normalized = file.filePath.replace(/\\/g, "/");
        const parts = normalized.split("/").filter(Boolean);
        let current = root;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isFile = i === parts.length - 1;
          // Preserve the original filePath for file nodes so lookups match the DB
          const currentPath = isFile ? file.filePath : parts.slice(0, i + 1).join("/");

          if (isFile) {
            current.children!.push({
              name: part,
              path: currentPath,
              type: "file",
              lastOperation: file.latestSnapshot.operation,
              lastAgent: file.latestSnapshot.agentName ?? file.latestSnapshot.agentId,
              lastCapturedAt: file.latestSnapshot.capturedAt,
            });
          } else {
            let dir = current.children!.find((c) => c.name === part && c.type === "directory");
            if (!dir) {
              dir = { name: part, path: currentPath, type: "directory", children: [] };
              current.children!.push(dir);
            }
            current = dir;
          }
        }
      }

      // Sort: directories first, then alphabetical
      function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const node of nodes) {
          if (node.children) sortTree(node.children);
        }
        return nodes;
      }

      return sortTree(root.children ?? []);
    },

    /**
     * Get snapshots for a specific run.
     */
    async getRunFiles(companyId: string, runId: string): Promise<FileSnapshot[]> {
      const rows = await db
        .select()
        .from(agentFileSnapshots)
        .where(
          and(
            eq(agentFileSnapshots.companyId, companyId),
            eq(agentFileSnapshots.runId, runId),
          ),
        )
        .orderBy(desc(agentFileSnapshots.capturedAt));

      const agentIds = [...new Set(rows.map((r) => r.agentId))];
      const agentRows = agentIds.length > 0
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : [];
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));

      return rows.map((r) => toSnapshot(r, agentNameMap.get(r.agentId)));
    },
  };
}
