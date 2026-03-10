import { createHash } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { fileContents, agentFileSnapshots } from "@paperclipai/db";
import { getRunLogStore } from "./run-log-store.js";
import { eq } from "drizzle-orm";
import pino from "pino";

const logger = pino({ name: "file-indexer" });

/** Tool names that represent file operations (across different adapters). */
const FILE_READ_TOOLS = new Set(["Read", "read_file", "ReadFile", "read", "cat", "View"]);
const FILE_WRITE_TOOLS = new Set(["Write", "write_file", "WriteFile", "write", "CreateFile", "create_file"]);
const FILE_EDIT_TOOLS = new Set(["Edit", "edit_file", "EditFile", "edit", "Replace", "ReplaceInFile", "Patch", "NotebookEdit"]);

interface ExtractedFileOp {
  filePath: string;
  content?: string;
  operation: "read" | "write" | "edit" | "delete";
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isMarkdownPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractFilePathFromInput(input: unknown): string | null {
  const rec = asRecord(input);
  if (!rec) return null;
  // Try common field names across adapters
  for (const key of ["file_path", "filePath", "path", "filename", "file", "target_file"]) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  return null;
}

function extractContentFromInput(input: unknown): string | undefined {
  const rec = asRecord(input);
  if (!rec) return undefined;
  for (const key of ["content", "new_string", "text", "code", "file_text"]) {
    if (typeof rec[key] === "string") return rec[key] as string;
  }
  return undefined;
}

/**
 * Parse a single NDJSON log line and extract file operations from tool_call entries.
 * Returns extracted file operations with path and operation type.
 */
function parseLogLine(line: string): { toolCall?: { name: string; input: unknown }; toolResult?: { content: string } } {
  try {
    const logEntry = JSON.parse(line) as { stream?: string; chunk?: string };
    if (logEntry.stream !== "stdout" || !logEntry.chunk) return {};

    // The chunk itself is a JSON string from the adapter
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = asRecord(JSON.parse(logEntry.chunk));
    } catch {
      return {};
    }
    if (!parsed) return {};

    const type = typeof parsed.type === "string" ? parsed.type : "";

    // Claude format: {type: "assistant", message: {content: [{type: "tool_use", name: "Read", input: {...}}]}}
    if (type === "assistant") {
      const message = asRecord(parsed.message);
      if (!message) return {};
      const content = Array.isArray(message.content) ? message.content : [];
      for (const blockRaw of content) {
        const block = asRecord(blockRaw);
        if (!block || block.type !== "tool_use") continue;
        if (typeof block.name === "string") {
          return { toolCall: { name: block.name, input: block.input } };
        }
      }
    }

    // Cursor format: tool_call events
    if (type === "tool_call" || type === "function_call") {
      return {
        toolCall: {
          name: typeof parsed.name === "string" ? parsed.name : "",
          input: parsed.input ?? parsed.arguments ?? parsed.params ?? {},
        },
      };
    }

    // User messages with tool_result
    if (type === "user") {
      const message = asRecord(parsed.message);
      if (!message) return {};
      const content = Array.isArray(message.content) ? message.content : [];
      for (const blockRaw of content) {
        const block = asRecord(blockRaw);
        if (!block || block.type !== "tool_result") continue;
        let text = "";
        if (typeof block.content === "string") {
          text = block.content;
        } else if (Array.isArray(block.content)) {
          const parts: string[] = [];
          for (const part of block.content as unknown[]) {
            const p = asRecord(part);
            if (p && typeof p.text === "string") parts.push(p.text);
          }
          text = parts.join("\n");
        }
        if (text) return { toolResult: { content: text } };
      }
    }
  } catch {
    // Silently skip unparseable lines
  }
  return {};
}

/**
 * Parse the full NDJSON run log and extract file operations.
 * Pairs tool_call entries with subsequent tool_result entries.
 */
export function extractFileOpsFromLog(logContent: string): ExtractedFileOp[] {
  const lines = logContent.split("\n").filter((l) => l.trim());
  const ops: ExtractedFileOp[] = [];
  const seenPaths = new Map<string, Set<string>>(); // path -> set of operations

  let pendingToolCall: { name: string; input: unknown } | null = null;

  for (const line of lines) {
    const { toolCall, toolResult } = parseLogLine(line);

    if (toolCall) {
      // Process the pending tool call if we get a new one without a result
      if (pendingToolCall) {
        const op = resolveFileOp(pendingToolCall, undefined);
        if (op) addOp(ops, seenPaths, op);
      }
      pendingToolCall = toolCall;
      continue;
    }

    if (toolResult && pendingToolCall) {
      const op = resolveFileOp(pendingToolCall, toolResult.content);
      if (op) addOp(ops, seenPaths, op);
      pendingToolCall = null;
      continue;
    }
  }

  // Handle any trailing tool call
  if (pendingToolCall) {
    const op = resolveFileOp(pendingToolCall, undefined);
    if (op) addOp(ops, seenPaths, op);
  }

  return ops;
}

function addOp(
  ops: ExtractedFileOp[],
  seenPaths: Map<string, Set<string>>,
  op: ExtractedFileOp,
): void {
  const key = op.filePath;
  let opSet = seenPaths.get(key);
  if (!opSet) {
    opSet = new Set();
    seenPaths.set(key, opSet);
  }

  // For reads, only store the first occurrence to avoid duplicates
  if (op.operation === "read" && opSet.has("read")) return;
  opSet.add(op.operation);
  ops.push(op);
}

function resolveFileOp(
  toolCall: { name: string; input: unknown },
  resultContent: string | undefined,
): ExtractedFileOp | null {
  const filePath = extractFilePathFromInput(toolCall.input);
  if (!filePath) return null;

  if (FILE_READ_TOOLS.has(toolCall.name)) {
    return {
      filePath,
      content: resultContent, // Read content comes from tool_result
      operation: "read",
    };
  }

  if (FILE_WRITE_TOOLS.has(toolCall.name)) {
    return {
      filePath,
      content: extractContentFromInput(toolCall.input) ?? resultContent,
      operation: "write",
    };
  }

  if (FILE_EDIT_TOOLS.has(toolCall.name)) {
    // For edits we don't have the full file content, just the changes
    return {
      filePath,
      content: resultContent, // Use the result which often contains the updated content
      operation: "edit",
    };
  }

  return null;
}

/**
 * Index files from a completed run by reading its NDJSON log.
 * This is the main entry point called after run completion.
 */
export async function indexRunFromLog(
  db: Db,
  run: {
    id: string;
    companyId: string;
    agentId: string;
    logStore?: string | null;
    logRef?: string | null;
  },
): Promise<number> {
  if (!run.logRef) return 0;

  try {
    const logStore = getRunLogStore();
    const handle = { store: (run.logStore ?? "local_file") as "local_file", logRef: run.logRef };

    // Read the entire log (up to 10MB)
    const { content: logContent } = await logStore.read(handle, { offset: 0, limitBytes: 10_000_000 });
    if (!logContent) return 0;

    const fileOps = extractFileOpsFromLog(logContent);
    if (fileOps.length === 0) return 0;

    let indexed = 0;
    for (const op of fileOps) {
      let contentHash: string | null = null;

      if (op.content && op.operation !== "delete") {
        const hash = sha256(op.content);
        contentHash = hash;

        await db
          .insert(fileContents)
          .values({
            hash,
            content: op.content,
            size: Buffer.byteLength(op.content, "utf8"),
            isMarkdown: isMarkdownPath(op.filePath),
          })
          .onConflictDoNothing({ target: fileContents.hash });
      }

      await db.insert(agentFileSnapshots).values({
        companyId: run.companyId,
        agentId: run.agentId,
        runId: run.id,
        filePath: op.filePath,
        contentHash,
        operation: op.operation,
      });

      indexed++;
    }

    logger.info({ runId: run.id, indexed }, "indexed files from run log");
    return indexed;
  } catch (err) {
    logger.warn({ err, runId: run.id }, "failed to index files from run log");
    return 0;
  }
}
