#!/usr/bin/env node
/**
 * Paperclip Local Runner — Comprehensive Edition
 *
 * Polls the Railway-hosted Paperclip server for queued runs, claims them,
 * executes adapter CLIs locally (via WSL), and reports results back.
 *
 * Supports: cursor, codex_local, claude_local, opencode_local, pi_local
 *
 * Features:
 *   - Workspace isolation per agent
 *   - Agent home directory ($AGENT_HOME) with instructions, memory, skills
 *   - Skills injection (paperclip, para-memory-files, etc.) into CLI skill dirs
 *   - Session management (resume codex/claude sessions across heartbeats)
 *   - Rich context env vars (wake reason, comment ID, approval, linked issues)
 *   - Codex JSONL parsing for session IDs and usage extraction
 *   - Prompt template rendering with {{variable}} substitution
 *   - Stale adapter command detection
 *   - WSLENV forwarding for all env vars
 *
 * Usage:
 *   $env:PAPERCLIP_SERVER_URL="https://papersrrv-production.up.railway.app"
 *   $env:PAPERCLIP_RUNNER_TOKEN="<your-token>"
 *   node scripts/local-runner.mjs
 *
 * Environment variables:
 *   PAPERCLIP_SERVER_URL   - URL of the Railway Paperclip server
 *   PAPERCLIP_RUNNER_TOKEN - Auth token matching the server's PAPERCLIP_RUNNER_TOKEN
 *   POLL_INTERVAL_MS       - Poll interval in ms (default: 3000)
 *   ADAPTER_TYPES          - Comma-separated adapter types to handle
 *   MAX_CONCURRENT_RUNS    - Max concurrent runs (default: 8)
 *   WSL_DISTRO             - WSL distribution name (default: Ubuntu)
 *   PAPERCLIP_WORKSPACE_ROOT - WSL-side workspace root (default: /root/paperclip-agents)
 */

import { spawn, execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// ─── Configuration ──────────────────────────────────────────────────────────

const SERVER_URL = process.env.PAPERCLIP_SERVER_URL;
const RUNNER_TOKEN = process.env.PAPERCLIP_RUNNER_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "3000", 10);
const ADAPTER_TYPES = process.env.ADAPTER_TYPES || "cursor,codex_local,claude_local,opencode_local,pi_local";
const MAX_CONCURRENT_RUNS = parseInt(process.env.MAX_CONCURRENT_RUNS || "3", 10);
const WSL_DISTRO = process.env.WSL_DISTRO || "Ubuntu";
const WORKSPACE_ROOT = process.env.PAPERCLIP_WORKSPACE_ROOT || "/root/paperclip-agents";

if (!SERVER_URL || !RUNNER_TOKEN) {
  console.error("ERROR: PAPERCLIP_SERVER_URL and PAPERCLIP_RUNNER_TOKEN are required");
  process.exit(1);
}

// Resolve project root from script location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(__dirname); // scripts/ -> project root
const SKILLS_DIR = join(PROJECT_ROOT, "skills");

const headers = {
  Authorization: `Bearer ${RUNNER_TOKEN}`,
  "Content-Type": "application/json",
};

// ─── API Helpers ────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const url = `${SERVER_URL}/api${path}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${opts.method || "GET"} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function sendLog(runId, stream, chunk) {
  try {
    await apiFetch(`/runner/log/${runId}`, {
      method: "POST",
      body: JSON.stringify({ stream, chunk }),
    });
  } catch {
    // Non-fatal: log streaming failure shouldn't kill the run
  }
}

// ─── Path Resolution ────────────────────────────────────────────────────────

const LOCAL_AGENTS_DIR = process.env.PAPERCLIP_LOCAL_AGENTS_DIR || join(PROJECT_ROOT, "agents");

/** Convert a Railway/WSL path to a local Windows path for file reads */
function resolveLocalPath(remotePath) {
  if (!remotePath) return null;
  if (remotePath.startsWith("/app/agents")) {
    return remotePath.replace("/app/agents", LOCAL_AGENTS_DIR).replace(/\//g, "\\");
  }
  if (remotePath.startsWith(WORKSPACE_ROOT)) {
    return remotePath.replace(WORKSPACE_ROOT, PROJECT_ROOT).replace(/\//g, "\\");
  }
  if (remotePath === "/app") return PROJECT_ROOT;
  return remotePath;
}

/** Load an instructions file (typically AGENTS.md) and prepend path context */
async function loadInstructionsFile(filePath) {
  if (!filePath) return "";
  const localPath = resolveLocalPath(filePath);
  if (!localPath) return "";
  try {
    const contents = await readFile(localPath, "utf8");
    // Use the WSL-side path for the agent to resolve relative refs
    const wslDir = dirname(filePath) + "/";
    return (
      `${contents}\n\n` +
      `The above agent instructions were loaded from ${filePath}. ` +
      `Resolve any relative file references from ${wslDir}\n\n`
    );
  } catch {
    return "";
  }
}

// ─── Template Rendering ─────────────────────────────────────────────────────

/** Resolve dot-path like "agent.name" from a nested data object */
function resolvePath(data, path) {
  const parts = path.split(".");
  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = current[part];
  }
  return current == null ? "" : String(current);
}

/** Render a template with {{variable}} substitution */
function renderTemplate(template, data) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => resolvePath(data, path));
}

// ─── Adapter Commands ───────────────────────────────────────────────────────

const DEFAULT_COMMANDS = {
  cursor: `wsl -d ${WSL_DISTRO} -- /root/.local/bin/agent`,
  codex_local: `wsl -d ${WSL_DISTRO} -- codex`,
  claude_local: `wsl -d ${WSL_DISTRO} -- claude`,
  opencode_local: `wsl -d ${WSL_DISTRO} -- opencode`,
  pi_local: `wsl -d ${WSL_DISTRO} -- pi`,
};

const DEFAULT_MODELS = {
  cursor: "composer-1.5",
  codex_local: "gpt-4.1-mini",
  claude_local: "claude-sonnet-4-5-20250929",
};

/** Detect if a stored command belongs to a different adapter */
function isStaleLegacyCommand(cmd, adapterType) {
  if (!cmd) return false;
  const cursorPatterns = ["/agent", "\\agent", "/root/.local/bin/agent"];
  if (adapterType !== "cursor" && cursorPatterns.some((p) => cmd.includes(p))) return true;
  if (adapterType !== "codex_local" && cmd.includes("codex")) return true;
  if (adapterType !== "claude_local" && cmd.includes("claude")) return true;
  return false;
}

// ─── Skills Injection ───────────────────────────────────────────────────────

/** One-time flag so we only inject skills once per runner lifetime */
let skillsInjected = false;

/**
 * Inject Paperclip skills into the CLI's skills directory inside WSL.
 * Skills are symlinked from the project's skills/ dir so they're discovered
 * automatically by codex/claude/cursor.
 */
function injectSkillsIfNeeded(adapterType) {
  if (skillsInjected) return;

  const localSkillsDir = SKILLS_DIR;
  if (!fs.existsSync(localSkillsDir)) return;

  const skillEntries = fs.readdirSync(localSkillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  if (skillEntries.length === 0) return;

  // Map adapter type to its skills directory inside WSL
  const skillTargets = {
    codex_local: "/root/.codex/skills",
    claude_local: "/root/.claude/skills",
    cursor: "/root/.cursor/skills",
  };

  // Inject into all supported CLI skill directories
  const wslSkillsSource = `${WORKSPACE_ROOT}/skills`;
  for (const [adapter, targetDir] of Object.entries(skillTargets)) {
    try {
      execSync(`wsl -d ${WSL_DISTRO} -- bash -c "mkdir -p '${targetDir}'"`, { stdio: "ignore" });
      for (const entry of skillEntries) {
        const source = `${wslSkillsSource}/${entry.name}`;
        const target = `${targetDir}/${entry.name}`;
        // Create symlink if it doesn't exist (idempotent)
        execSync(
          `wsl -d ${WSL_DISTRO} -- bash -c "[ -e '${target}' ] || ln -s '${source}' '${target}'"`,
          { stdio: "ignore" },
        );
      }
    } catch {
      // Best-effort: skill injection is not required for basic operation
    }
  }

  skillsInjected = true;
  console.log(`🔧 Injected ${skillEntries.length} skills: ${skillEntries.map((e) => e.name).join(", ")}`);
}

// ─── Codex JSONL Parsing ────────────────────────────────────────────────────

/**
 * Parse codex JSONL output to extract session ID, usage stats, and summary.
 * Codex emits structured JSON events on stdout, one per line.
 */
function parseCodexJsonl(stdout) {
  const result = {
    sessionId: null,
    usage: null,
    summary: null,
    errorMessage: null,
  };

  const lines = stdout.split("\n").filter(Boolean);
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let hasUsage = false;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      // Extract session/thread ID
      if (event.type === "thread.started" && event.thread_id) {
        result.sessionId = event.thread_id;
      }

      // Accumulate usage from turn completions
      if (event.type === "turn.completed" && event.usage) {
        hasUsage = true;
        totalInput += event.usage.input_tokens || 0;
        totalOutput += event.usage.output_tokens || 0;
        totalCached += event.usage.cached_input_tokens || 0;
      }

      // Extract final agent message as summary
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        result.summary = event.item.text;
      }

      // Detect errors
      if (event.type === "error") {
        result.errorMessage = event.message || "Unknown codex error";
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  if (hasUsage) {
    result.usage = {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cachedInputTokens: totalCached,
    };
  }

  return result;
}

/**
 * Parse cursor/claude stream-json output for usage stats.
 */
function parseStreamJsonUsage(stdout) {
  const result = { usage: null, summary: null, costUsd: null };
  const lines = stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && event.usage) {
        result.usage = {
          inputTokens: event.usage.input_tokens || event.usage.inputTokens || 0,
          outputTokens: event.usage.output_tokens || event.usage.outputTokens || 0,
          cachedInputTokens: event.usage.cache_read_input_tokens || event.usage.cachedInputTokens || 0,
        };
        if (event.cost_usd != null) result.costUsd = event.cost_usd;
        if (event.result) result.summary = event.result;
      }
      if (event.type === "usage") {
        result.usage = {
          inputTokens: event.usage?.input_tokens || 0,
          outputTokens: event.usage?.output_tokens || 0,
          cachedInputTokens: event.usage?.cache_read_input_tokens || 0,
        };
      }
    } catch { /* skip non-JSON */ }
  }

  return result;
}

// ─── Run Execution ──────────────────────────────────────────────────────────

async function executeRun(runId, agent, context, authToken, runtimeState) {
  const config = typeof agent.adapterConfig === "string"
    ? JSON.parse(agent.adapterConfig)
    : agent.adapterConfig || {};

  const adapterType = agent.adapterType || "cursor";

  // Resolve command — ignore stale commands from prior adapters
  const defaultCmd = DEFAULT_COMMANDS[adapterType] || DEFAULT_COMMANDS.cursor;
  const command = (config.command && !isStaleLegacyCommand(config.command, adapterType))
    ? config.command
    : defaultCmd;

  // ── Workspace & Agent Home resolution ──

  const baseWorkspace = WORKSPACE_ROOT.replace(/\/$/, "");
  const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Agent home: where AGENTS.md, SOUL.md, HEARTBEAT.md, TOOLS.md, memory/, life/ live
  const agentHome = `${baseWorkspace}/agents/${safeName}`;

  // Use agent home as workspace so CLIs auto-discover AGENTS.md, HEARTBEAT.md etc.
  // as project files — avoids slow manual file reads via shell commands.
  const workspaceDir = agentHome;

  // Instructions file: resolve from config or derive from agent name
  const instructionsFilePath = config.instructionsFilePath
    || `${baseWorkspace}/agents/${safeName}/AGENTS.md`;

  // ── Session management ──
  // Prefer structured sessionParams (from task sessions), fallback to bare sessionId

  const previousSessionParams = runtimeState?.sessionParams || null;
  const previousSessionId = previousSessionParams?.sessionId || runtimeState?.sessionId || null;
  const previousSessionCwd = previousSessionParams?.cwd || "";

  // Can only resume if session exists AND the workspace hasn't changed
  const canResume = previousSessionId
    && adapterType === "codex_local"
    && (!previousSessionCwd || previousSessionCwd === workspaceDir);

  // ── Ensure directories exist inside WSL ──

  const isWsl = command.toLowerCase().startsWith("wsl ");
  if (isWsl) {
    try {
      execSync(`wsl -d ${WSL_DISTRO} -- bash -c "mkdir -p '${agentHome}'"`, { stdio: "ignore" });
    } catch { /* best-effort */ }
  }

  // Ensure local Windows mirror exists for log writes
  const localWorkspace = resolveLocalPath(workspaceDir);
  if (localWorkspace && !fs.existsSync(localWorkspace)) {
    fs.mkdirSync(localWorkspace, { recursive: true });
  }

  // ── Inject skills into CLI skill directories ──

  if (isWsl) {
    injectSkillsIfNeeded(adapterType);
  }

  // ── Model ──

  const model = config.model || DEFAULT_MODELS[adapterType] || "auto";

  console.log(`[run:${runId}] Agent: ${agent.name} | Adapter: ${adapterType} | Model: ${model} | Session: ${canResume ? previousSessionId.slice(0, 8) + "..." : "new"}`);

  // ── Build environment variables ──
  // Matches the original paperclip's buildPaperclipEnv + context enrichment

  const issueId = context.issueId || context.taskId || "";
  const wakeReason = context.wakeReason || context.reason || "heartbeat_timer";
  const wakeCommentId = context.wakeCommentId || context.commentId || "";
  const approvalId = context.approvalId || "";
  const approvalStatus = context.approvalStatus || "";
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter(Boolean).join(",")
    : "";

  const env = {
    ...process.env,
    // Core Paperclip env (no /api suffix — agent instructions prepend /api to endpoints)
    PAPERCLIP_API_URL: SERVER_URL,
    PAPERCLIP_RUN_ID: runId,
    PAPERCLIP_AGENT_ID: agent.id,
    PAPERCLIP_COMPANY_ID: agent.companyId,
    PAPERCLIP_WAKE_REASON: wakeReason,
    // Agent home for $AGENT_HOME/HEARTBEAT.md, $AGENT_HOME/SOUL.md, etc.
    AGENT_HOME: agentHome,
  };

  // Auth token
  if (authToken) env.PAPERCLIP_API_KEY = authToken;

  // Wake context — only set if non-empty (agents check for presence)
  if (issueId) env.PAPERCLIP_TASK_ID = issueId;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds;

  // Workspace context (so agents can discover their workspace programmatically)
  // Extract from server-provided contextSnapshot when available
  const workspaceContext = context.paperclipWorkspace || {};
  const workspaceHints = Array.isArray(context.paperclipWorkspaces) ? context.paperclipWorkspaces : [];

  env.PAPERCLIP_WORKSPACE_CWD = workspaceContext.cwd || workspaceDir;
  if (workspaceContext.source) env.PAPERCLIP_WORKSPACE_SOURCE = workspaceContext.source;
  if (workspaceContext.workspaceId) env.PAPERCLIP_WORKSPACE_ID = workspaceContext.workspaceId;
  if (workspaceContext.repoUrl) env.PAPERCLIP_WORKSPACE_REPO_URL = workspaceContext.repoUrl;
  if (workspaceContext.repoRef) env.PAPERCLIP_WORKSPACE_REPO_REF = workspaceContext.repoRef;
  if (workspaceHints.length > 0) env.PAPERCLIP_WORKSPACES_JSON = JSON.stringify(workspaceHints);

  // Inject agent-specific env vars from adapterConfig
  if (config.env && typeof config.env === "object") {
    for (const [key, value] of Object.entries(config.env)) {
      env[key] = String(value);
    }
  }

  // ── WSLENV forwarding ──
  // All PAPERCLIP_* vars + AGENT_HOME + API keys + config env must be forwarded

  if (isWsl) {
    const paperclipKeys = Object.keys(env).filter((k) => k.startsWith("PAPERCLIP_"));
    const configEnvKeys = config.env ? Object.keys(config.env) : [];
    const apiKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => env[k]);
    const extraKeys = ["AGENT_HOME"];
    const existing = env.WSLENV || process.env.WSLENV || "";
    const allKeys = [...new Set([...paperclipKeys, ...configEnvKeys, ...apiKeys, ...extraKeys])];
    env.WSLENV = [...(existing ? [existing] : []), ...allKeys].join(":");
  }

  // ── Build prompt ──

  const instructionsPrefix = await loadInstructionsFile(instructionsFilePath);

  // Template data for {{variable}} substitution
  const templateData = {
    agent: { id: agent.id, name: agent.name, companyId: agent.companyId },
    run: { id: runId, source: "on_demand" },
    context,
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
  };

  const defaultTemplate = `Heartbeat run for {{agent.name}}. Wake reason: ${wakeReason}.`;
  const promptTemplate = config.promptTemplate || defaultTemplate;
  const renderedPrompt = renderTemplate(promptTemplate, templateData);

  // Build compact env note — only include key operational vars to save tokens
  // (all vars are already available in the process environment)
  const keyVars = [
    `PAPERCLIP_API_URL=${SERVER_URL}`,
    `PAPERCLIP_AGENT_ID=${agent.id}`,
    `PAPERCLIP_RUN_ID=${runId}`,
    `AGENT_HOME=${agentHome}`,
    issueId ? `PAPERCLIP_TASK_ID=${issueId}` : null,
    wakeReason !== "heartbeat_timer" ? `PAPERCLIP_WAKE_REASON=${wakeReason}` : null,
    wakeCommentId ? `PAPERCLIP_WAKE_COMMENT_ID=${wakeCommentId}` : null,
  ].filter(Boolean).join("\n");
  const envNote = `Environment:\n\`\`\`\n${keyVars}\n\`\`\`\n\n`;

  const prompt = `${instructionsPrefix}${envNote}${renderedPrompt}`;

  // ── Build CLI command + args ──

  const parts = command.split(/\s+/);
  const cmd = parts[0];
  let args;

  if (adapterType === "codex_local") {
    // Codex CLI: codex exec --json -C <workspace> --skip-git-repo-check --model <model> [resume <sessionId>] -
    args = [...parts.slice(1), "exec", "--json", "-C", workspaceDir, "--skip-git-repo-check"];
    if (model) args.push("--model", model);
    // Default reasoning effort to "low" for cost savings — agents mostly do API calls, not deep reasoning
    const reasoningEffort = config.modelReasoningEffort || "low";
    args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    if (config.search) args.push("--search");
    if (config.dangerouslyBypassApprovalsAndSandbox !== false) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    }
    if (config.extraArgs?.length) args.push(...config.extraArgs);
    // Session resume: codex exec resume <sessionId> -
    if (canResume) args.push("resume", previousSessionId, "-");
    else args.push("-");

  } else if (adapterType === "claude_local") {
    // Claude CLI: claude -p --output-format stream-json --cwd <workspace> --model <model>
    args = [...parts.slice(1), "-p", "--output-format", "stream-json", "--cwd", workspaceDir];
    if (model) args.push("--model", model);
    if (config.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    if (config.extraArgs?.length) args.push(...config.extraArgs);

  } else {
    // Cursor CLI (default): agent -p --output-format stream-json --workspace <dir>
    args = [...parts.slice(1), "-p", "--output-format", "stream-json", "--workspace", workspaceDir];
    if (model) args.push("--model", model);
    if (config.dangerouslyBypassApprovalsAndSandbox) args.push("--yolo");
    if (config.extraArgs?.length) args.push(...config.extraArgs);
  }

  // ── Log buffering & local file writing ──

  let logBuffer = [];
  const logsDir = join(PROJECT_ROOT, "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const logFilePath = join(logsDir, `run-${runId}-${agent.name.replace(/[^a-z0-9]/gi, "_")}.log`);
  fs.writeFileSync(logFilePath, [
    `=== STARTED RUN ${runId} for ${agent.name} ===`,
    `Adapter: ${adapterType} | Model: ${model}`,
    `Workspace: ${workspaceDir}`,
    `Agent Home: ${agentHome}`,
    `Session: ${canResume ? `resume ${previousSessionId}` : "new"}`,
    `Command: ${cmd} ${args.join(" ")}`,
    `Wake: ${wakeReason}${issueId ? ` | Task: ${issueId}` : ""}`,
    "",
  ].join("\n"));

  const flushLogs = async () => {
    if (logBuffer.length === 0) return;
    const chunk = logBuffer.join("");
    logBuffer = [];
    fs.appendFileSync(logFilePath, chunk);
    await sendLog(runId, "stdout", chunk);
  };
  const logTimer = setInterval(flushLogs, 500);

  // ── Spawn child process ──

  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;

    const timeoutSec = config.timeoutSec || 180;
    const timeoutTimer = timeoutSec > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // Force kill after grace period
        const graceSec = config.graceSec || 20;
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, graceSec * 1000);
      }, timeoutSec * 1000)
      : null;

    const child = spawn(cmd, args, {
      cwd: resolveLocalPath(workspaceDir) || undefined,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe prompt via stdin
    if (prompt) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdoutBuf += chunk;
      process.stdout.write(`[${agent.name}] ${chunk}`);
      logBuffer.push(chunk);
    });

    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderrBuf += chunk;
      process.stderr.write(`[${agent.name}] ERR: ${chunk}`);
      logBuffer.push(chunk);
    });

    child.on("error", (err) => {
      clearInterval(logTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      flushLogs().catch(() => {});
      console.error(`[run:${runId}] Spawn error:`, err.message);
      resolve({
        exitCode: 1, signal: null, timedOut: false,
        errorMessage: err.message, errorCode: "spawn_error",
        stdoutExcerpt: stdoutBuf.slice(-4096), stderrExcerpt: stderrBuf.slice(-4096),
      });
    });

    child.on("close", (code, signal) => {
      clearInterval(logTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);

      flushLogs().then(() => {
        console.log(`[run:${runId}] Exited code=${code} signal=${signal}`);

        // ── Parse output based on adapter type ──

        let usage, sessionId, summary, costUsd, errorMessage;

        if (adapterType === "codex_local") {
          const parsed = parseCodexJsonl(stdoutBuf);
          usage = parsed.usage;
          sessionId = parsed.sessionId;
          summary = parsed.summary;
          errorMessage = parsed.errorMessage;

          // Retry logic: if session resume failed, clear session for next run
          if (canResume && code !== 0 && stderrBuf.includes("unknown session")) {
            console.log(`[run:${runId}] Session ${previousSessionId} expired, clearing for next run`);
            sessionId = null; // Server will clear stored session
          }
        } else {
          const parsed = parseStreamJsonUsage(stdoutBuf);
          usage = parsed.usage;
          costUsd = parsed.costUsd;
          summary = parsed.summary;
        }

        // Build structured sessionParams for cross-heartbeat resume
        const sessionParams = sessionId ? {
          sessionId,
          cwd: workspaceDir,
          ...(workspaceContext.workspaceId ? { workspaceId: workspaceContext.workspaceId } : {}),
          ...(workspaceContext.repoUrl ? { repoUrl: workspaceContext.repoUrl } : {}),
          ...(workspaceContext.repoRef ? { repoRef: workspaceContext.repoRef } : {}),
        } : null;

        const result = {
          exitCode: code,
          signal: signal || null,
          timedOut,
          errorMessage: timedOut
            ? `Timed out after ${timeoutSec}s`
            : errorMessage || (code !== 0 ? `Process exited with code ${code}` : null),
          errorCode: timedOut ? "timeout" : (code !== 0 ? "adapter_failed" : null),
          usage,
          costUsd: costUsd || null,
          sessionId: sessionId || null,
          sessionParams,
          sessionDisplayId: sessionId ? sessionId.slice(0, 12) : null,
          summary: summary || null,
          billingType: adapterType === "codex_local" ? "api" : null,
          stdoutExcerpt: stdoutBuf.slice(-4096),
          stderrExcerpt: stderrBuf.slice(-4096),
        };

        // Log summary
        if (summary) {
          const truncated = summary.length > 200 ? summary.slice(0, 200) + "..." : summary;
          console.log(`[run:${runId}] Summary: ${truncated}`);
        }
        if (usage) {
          console.log(`[run:${runId}] Tokens: in=${usage.inputTokens} out=${usage.outputTokens} cached=${usage.cachedInputTokens}`);
        }

        resolve(result);
      }).catch(() => {});
    });
  });
}

// ─── Poll & Claim ───────────────────────────────────────────────────────────

// Track which agents currently have active runs (prevents claiming duplicate runs)
const activeAgentIds = new Set();

async function pollAndClaim(activeRunIds) {
  try {
    const pollResult = await apiFetch(`/runner/poll?adapterTypes=${ADAPTER_TYPES}`);
    if (!pollResult.run) return false;

    const { runId, agentId } = pollResult.run;
    if (activeRunIds.has(runId)) return false;

    // Skip if this agent already has an active run (prevent concurrent runs for same agent)
    if (activeAgentIds.has(agentId)) return false;

    console.log(`📥 Pickup: ${runId} (Agent ${agentId})`);
    const claimResult = await apiFetch(`/runner/claim/${runId}`, { method: "POST" });
    const { agent, run, runtime, authToken } = claimResult;

    const adType = agent.adapterType || "cursor";
    const mdl = (agent.adapterConfig?.model) || DEFAULT_MODELS[adType] || "auto";
    console.log(`✅ Claimed: ${agent.name} [${adType}/${mdl}] [Running: ${activeRunIds.size + 1}/${MAX_CONCURRENT_RUNS}]`);
    activeRunIds.add(runId);
    activeAgentIds.add(agent.id);

    executeRun(runId, agent, run.contextSnapshot || {}, authToken, runtime)
      .then(async (result) => {
        try {
          await apiFetch(`/runner/complete/${runId}`, {
            method: "POST",
            body: JSON.stringify(result),
          });
          const emoji = result.exitCode === 0 ? "✅" : "❌";
          console.log(`${emoji} Done: ${agent.name} (${runId}) exit=${result.exitCode}`);
        } catch (err) {
          console.error(`❌ Complete error ${runId}: ${err.message}`);
        }
      })
      .catch((err) => {
        console.error(`❌ Runner crash ${runId}:`, err);
      })
      .finally(() => {
        activeRunIds.delete(runId);
        activeAgentIds.delete(agent.id);
      });

    return true;
  } catch (err) {
    if (!err.message.includes("409")) {
      console.error(`❌ Poll/Claim error: ${err.message}`);
    }
    return false;
  }
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

async function pollLoop() {
  const activeRunIds = new Set();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        Paperclip Local Runner — Comprehensive          ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Server:     ${SERVER_URL}`);
  console.log(`║  Adapters:   ${ADAPTER_TYPES}`);
  console.log(`║  Concurrency: ${MAX_CONCURRENT_RUNS} | Poll: ${POLL_INTERVAL}ms`);
  console.log(`║  WSL:        ${WSL_DISTRO} | Root: ${WORKSPACE_ROOT}`);
  console.log(`║  Skills:     ${SKILLS_DIR}`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  while (true) {
    if (activeRunIds.size < MAX_CONCURRENT_RUNS) {
      const claimed = await pollAndClaim(activeRunIds);
      if (claimed) {
        // If we found something, try to pick up another immediately
        await sleep(100);
        continue;
      }
    }

    await sleep(activeRunIds.size >= MAX_CONCURRENT_RUNS ? 1000 : POLL_INTERVAL);
  }
}

pollLoop();
