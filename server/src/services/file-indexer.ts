import { createHash } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { fileContents, agentFileSnapshots, heartbeatRunEvents } from "@paperclipai/db";
import { getRunLogStore } from "./run-log-store.js";
import { eq, and, asc } from "drizzle-orm";
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
  for (const key of ["file_path", "filePath", "path", "filename", "file", "target_file", "relative_workspace_path", "relativeWorkspacePath"]) {
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

type ParsedEvent = { toolCall: { name: string; input: unknown } } | { toolResult: { content: string } };

/**
 * Try to parse a single JSON object from adapter stdout and extract tool events.
 * Supports multiple adapter formats:
 *   - Claude: {type:"assistant", message:{content:[{type:"tool_use", name, input}]}}
 *   - Cursor tool_call: {type:"tool_call", subtype:"started", tool_call:{toolName:{args}}}
 *   - Cursor tool_use: {type:"tool_use", part:{tool, state:{input, output, status}}}
 *   - Generic: {type:"tool_call"|"function_call", name, input}
 */
function parseAdapterJson(parsed: Record<string, unknown>): ParsedEvent[] {
  const type = typeof parsed.type === "string" ? parsed.type : "";
  const results: ParsedEvent[] = [];

  // Claude format: {type: "assistant", message: {content: [{type: "tool_use"|"tool_call", name, input}]}}
  if (type === "assistant") {
    const message = asRecord(parsed.message);
    if (!message) return results;
    const content = Array.isArray(message.content) ? message.content : [];
    for (const blockRaw of content) {
      const block = asRecord(blockRaw);
      if (!block) continue;
      const blockType = typeof block.type === "string" ? block.type : "";

      if (blockType === "tool_use" || blockType === "tool_call") {
        const name = typeof block.name === "string" ? block.name : (typeof block.tool === "string" ? block.tool : "");
        if (name) {
          results.push({ toolCall: { name, input: block.input ?? block.arguments ?? block.args ?? {} } });
        }
      }

      if (blockType === "tool_result") {
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
        const output = typeof block.output === "string" ? block.output : "";
        if (text || output) results.push({ toolResult: { content: text || output } });
      }
    }
    return results;
  }

  // Cursor tool_call event: {type:"tool_call", subtype:"started"|"completed", tool_call:{ReadFile:{args:{...}}}}
  if (type === "tool_call") {
    const subtype = typeof parsed.subtype === "string" ? parsed.subtype : "";

    // Nested tool_call object format
    const toolCallObj = asRecord(parsed.tool_call ?? parsed.toolCall);
    if (toolCallObj) {
      const toolName = Object.keys(toolCallObj)[0];
      if (toolName) {
        const payload = asRecord(toolCallObj[toolName]) ?? {};

        if (subtype === "started" || subtype === "start" || !subtype) {
          const rawInput = payload.args ?? asRecord(payload.function)?.arguments ?? payload;
          results.push({ toolCall: { name: toolName, input: rawInput } });
        }

        if (subtype === "completed" || subtype === "complete" || subtype === "finished") {
          const result = payload.result ?? payload.output ?? payload.error;
          const content = typeof result === "string" ? result : (result !== undefined ? JSON.stringify(result) : `${toolName} completed`);
          results.push({ toolResult: { content } });
        }
      }
      return results;
    }

    // Flat format: {type:"tool_call", name:"Read", input:{...}}
    const name = typeof parsed.name === "string" ? parsed.name : "";
    if (name) {
      results.push({ toolCall: { name, input: parsed.input ?? parsed.arguments ?? parsed.params ?? {} } });
    }
    return results;
  }

  if (type === "function_call") {
    const name = typeof parsed.name === "string" ? parsed.name : "";
    if (name) {
      results.push({ toolCall: { name, input: parsed.input ?? parsed.arguments ?? parsed.params ?? {} } });
    }
    return results;
  }

  // Cursor tool_use format: {type:"tool_use", part:{tool:"ReadFile", state:{input:{}, output:"...", status:"..."}}}
  if (type === "tool_use") {
    const part = asRecord(parsed.part);
    if (part) {
      const toolName = typeof part.tool === "string" ? part.tool : "";
      const state = asRecord(part.state);
      if (toolName && state) {
        results.push({ toolCall: { name: toolName, input: state.input ?? {} } });
        const output = typeof state.output === "string" ? state.output : "";
        if (output) {
          results.push({ toolResult: { content: output } });
        }
      }
    }
    return results;
  }

  // User messages with tool_result
  if (type === "user") {
    const message = asRecord(parsed.message);
    if (!message) return results;
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
      if (text) results.push({ toolResult: { content: text } });
    }
  }

  return results;
}

/**
 * Extract all tool events from a single NDJSON log line.
 * Each log line has {ts, stream, chunk} where chunk may contain multiple
 * newline-separated JSON objects from the adapter's raw stdout.
 */
function parseLogLine(line: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  try {
    const logEntry = JSON.parse(line) as { stream?: string; chunk?: string };
    if (logEntry.stream !== "stdout" || !logEntry.chunk) return events;

    // The chunk may contain multiple newline-separated JSON objects
    const subLines = logEntry.chunk.split("\n");
    for (const subLine of subLines) {
      let trimmed = subLine.trim();
      if (!trimmed) continue;

      // Handle Cursor "stdout: {json}" or "stdout={json}" prefix
      const prefixed = trimmed.match(/^(?:stdout|stderr)\s*[:=]?\s*([\[{].*)$/i);
      if (prefixed) trimmed = prefixed[1]!.trim();

      try {
        const parsed = asRecord(JSON.parse(trimmed));
        if (!parsed) continue;
        const subEvents = parseAdapterJson(parsed);
        events.push(...subEvents);
      } catch {
        // Not valid JSON — skip this sub-line
      }
    }
  } catch {
    // Outer NDJSON line not parseable — skip
  }
  return events;
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
  let totalEvents = 0;
  let toolCallEvents = 0;
  let toolResultEvents = 0;
  const toolNamesSeen = new Set<string>();

  for (const line of lines) {
    const events = parseLogLine(line);

    for (const event of events) {
      totalEvents++;
      if ("toolCall" in event) {
        toolCallEvents++;
        toolNamesSeen.add(event.toolCall.name);
        // Process the pending tool call if we get a new one without a result
        if (pendingToolCall) {
          const op = resolveFileOp(pendingToolCall, undefined);
          if (op) addOp(ops, seenPaths, op);
        }
        pendingToolCall = event.toolCall;
      } else if ("toolResult" in event && pendingToolCall) {
        toolResultEvents++;
        const op = resolveFileOp(pendingToolCall, event.toolResult.content);
        if (op) addOp(ops, seenPaths, op);
        pendingToolCall = null;
      }
    }
  }

  // Handle any trailing tool call
  if (pendingToolCall) {
    const op = resolveFileOp(pendingToolCall, undefined);
    if (op) addOp(ops, seenPaths, op);
  }

  logger.info({
    ndjsonLines: lines.length,
    totalEvents,
    toolCallEvents,
    toolResultEvents,
    toolNamesSeen: [...toolNamesSeen],
    fileOpsFound: ops.length,
    sampleLine: lines[0]?.slice(0, 300),
  }, "extractFileOpsFromLog diagnostic");

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
 * Extract file ops from raw chunk strings (e.g. from DB heartbeat_run_events.message).
 * Each chunk is the raw adapter stdout — may contain multiple newline-separated JSON objects.
 */
export function extractFileOpsFromChunks(chunks: string[]): ExtractedFileOp[] {
  const ops: ExtractedFileOp[] = [];
  const seenPaths = new Map<string, Set<string>>();
  let pendingToolCall: { name: string; input: unknown } | null = null;
  let totalEvents = 0;
  let toolCallEvents = 0;
  let toolResultEvents = 0;
  let parsedJsonCount = 0;
  let parseFailCount = 0;
  const toolNamesSeen = new Set<string>();
  const eventTypesSeen = new Set<string>();

  for (const chunk of chunks) {
    // Each chunk may contain multiple newline-separated JSON objects
    const subLines = chunk.split("\n");
    for (const subLine of subLines) {
      let trimmed = subLine.trim();
      if (!trimmed) continue;

      // Handle Cursor "stdout: {json}" or "stdout={json}" prefix
      const prefixed = trimmed.match(/^(?:stdout|stderr)\s*[:=]?\s*([\[{].*)$/i);
      if (prefixed) trimmed = prefixed[1]!.trim();

      try {
        const parsed = asRecord(JSON.parse(trimmed));
        if (!parsed) continue;
        parsedJsonCount++;
        if (typeof parsed.type === "string") eventTypesSeen.add(parsed.type);
        const events = parseAdapterJson(parsed);

        for (const event of events) {
          totalEvents++;
          if ("toolCall" in event) {
            toolCallEvents++;
            toolNamesSeen.add(event.toolCall.name);
            if (pendingToolCall) {
              const op = resolveFileOp(pendingToolCall, undefined);
              if (op) addOp(ops, seenPaths, op);
            }
            pendingToolCall = event.toolCall;
          } else if ("toolResult" in event && pendingToolCall) {
            toolResultEvents++;
            const op = resolveFileOp(pendingToolCall, event.toolResult.content);
            if (op) addOp(ops, seenPaths, op);
            pendingToolCall = null;
          }
        }
      } catch {
        parseFailCount++;
      }
    }
  }

  if (pendingToolCall) {
    const op = resolveFileOp(pendingToolCall, undefined);
    if (op) addOp(ops, seenPaths, op);
  }

  logger.info({
    chunkCount: chunks.length,
    parsedJsonCount,
    parseFailCount,
    totalEvents,
    toolCallEvents,
    toolResultEvents,
    toolNamesSeen: [...toolNamesSeen],
    eventTypesSeen: [...eventTypesSeen],
    fileOpsFound: ops.length,
    sampleChunk: chunks[0]?.slice(0, 300),
  }, "extractFileOpsFromChunks diagnostic");

  return ops;
}

/**
 * Read file ops from DB run events (heartbeat_run_events) as a fallback
 * when NDJSON log files are unavailable (e.g. after Railway redeploy).
 */
async function extractFileOpsFromDbEvents(db: Db, runId: string): Promise<ExtractedFileOp[]> {
  const events = await db
    .select({ stream: heartbeatRunEvents.stream, message: heartbeatRunEvents.message })
    .from(heartbeatRunEvents)
    .where(and(eq(heartbeatRunEvents.runId, runId), eq(heartbeatRunEvents.stream, "stdout")))
    .orderBy(asc(heartbeatRunEvents.seq));

  if (events.length === 0) return [];

  const chunks = events.map((e) => e.message ?? "").filter(Boolean);
  logger.info({ runId, dbEventCount: chunks.length }, "extracting file ops from DB events (NDJSON file unavailable)");
  return extractFileOpsFromChunks(chunks);
}

/**
 * Index files from a completed run by reading its NDJSON log.
 * Falls back to DB events if the log file is unavailable.
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
  try {
    let fileOps: ExtractedFileOp[] = [];

    // Strategy 1: Read from NDJSON log file
    if (run.logRef) {
      try {
        const logStore = getRunLogStore();
        const handle = { store: (run.logStore ?? "local_file") as "local_file", logRef: run.logRef };
        const result = await logStore.read(handle, { offset: 0, limitBytes: 10_000_000 });
        if (result.content) {
          logger.info({ runId: run.id, logBytes: result.content.length }, "reading run log for file indexing");
          fileOps = extractFileOpsFromLog(result.content);
        }
      } catch {
        // Log file missing — fall through to DB events
        logger.info({ runId: run.id }, "NDJSON log file unavailable, falling back to DB events");
      }
    }

    // Strategy 2: Fall back to DB events if NDJSON produced nothing
    if (fileOps.length === 0) {
      fileOps = await extractFileOpsFromDbEvents(db, run.id);
    }

    logger.info({ runId: run.id, fileOpsCount: fileOps.length, sample: fileOps.slice(0, 3).map(o => `${o.operation}:${o.filePath}`) }, "extracted file ops");
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
