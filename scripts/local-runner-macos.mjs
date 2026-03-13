#!/usr/bin/env node
/**
 * Paperclip Local Runner — macOS Native Edition
 *
 * Polls the local Paperclip server for queued runs, claims them,
 * executes adapter CLIs natively (no WSL), and reports results back.
 *
 * Supports: claude_local, codex_local, cursor, opencode_local, pi_local
 *
 * Usage:
 *   PAPERCLIP_SERVER_URL=http://localhost:3100 \
 *   PAPERCLIP_RUNNER_TOKEN=<token> \
 *   node scripts/local-runner-macos.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// ─── Configuration ──────────────────────────────────────────────────────────

const SERVER_URL = process.env.PAPERCLIP_SERVER_URL || "http://localhost:3100";
const RUNNER_TOKEN = process.env.PAPERCLIP_RUNNER_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "1000", 10);
const ADAPTER_TYPES = process.env.ADAPTER_TYPES || "claude_local,codex_local,cursor,opencode_local,pi_local";
const MAX_CONCURRENT_RUNS = parseInt(process.env.MAX_CONCURRENT_RUNS || "3", 10);
const WORKSPACE_ROOT = process.env.PAPERCLIP_WORKSPACE_ROOT || join(homedir(), "paperclip-agents");

if (!RUNNER_TOKEN) {
  console.error("ERROR: PAPERCLIP_RUNNER_TOKEN is required");
  process.exit(1);
}

// Resolve project root from script location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(__dirname);
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
    // Non-fatal
  }
}

// ─── Path Resolution ────────────────────────────────────────────────────────

/** Load an instructions file and prepend path context */
async function loadInstructionsFile(filePath) {
  if (!filePath) return "";
  try {
    const contents = await readFile(filePath, "utf8");
    const dir = dirname(filePath) + "/";
    return (
      `${contents}\n\n` +
      `The above agent instructions were loaded from ${filePath}. ` +
      `Resolve any relative file references from ${dir}\n\n`
    );
  } catch {
    return "";
  }
}

// ─── Template Rendering ─────────────────────────────────────────────────────

function resolvePath(data, path) {
  const parts = path.split(".");
  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = current[part];
  }
  return current == null ? "" : String(current);
}

function renderTemplate(template, data) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => resolvePath(data, path));
}

// ─── Adapter Commands (native macOS — no WSL) ──────────────────────────────

const DEFAULT_COMMANDS = {
  cursor: "agent",
  codex_local: "codex",
  claude_local: "claude",
  opencode_local: "opencode",
  pi_local: "pi",
};

const DEFAULT_MODELS = {
  cursor: "composer-1.5",
  codex_local: "gpt-4.1-mini",
  claude_local: "claude-sonnet-4-5-20250929",
};

function isStaleLegacyCommand(cmd, adapterType) {
  if (!cmd) return false;
  // Detect WSL-prefixed commands from old Windows setup
  if (cmd.toLowerCase().includes("wsl ")) return true;
  const cursorPatterns = ["/agent", "\\agent", "/root/.local/bin/agent"];
  if (adapterType !== "cursor" && cursorPatterns.some((p) => cmd.includes(p))) return true;
  if (adapterType !== "codex_local" && cmd.includes("codex")) return true;
  if (adapterType !== "claude_local" && cmd.includes("claude")) return true;
  return false;
}

// ─── Skills Injection ───────────────────────────────────────────────────────

let skillsInjected = false;

function injectSkillsIfNeeded() {
  if (skillsInjected) return;
  if (!fs.existsSync(SKILLS_DIR)) return;

  const skillEntries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (skillEntries.length === 0) return;

  const home = homedir();
  const skillTargets = {
    codex_local: join(home, ".codex", "skills"),
    claude_local: join(home, ".claude", "skills"),
    cursor: join(home, ".cursor", "skills"),
  };

  for (const [, targetDir] of Object.entries(skillTargets)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      for (const entry of skillEntries) {
        const source = join(SKILLS_DIR, entry.name);
        const target = join(targetDir, entry.name);
        if (!fs.existsSync(target)) {
          fs.symlinkSync(source, target, "dir");
        }
      }
    } catch {
      // Best-effort
    }
  }

  skillsInjected = true;
  console.log(`  Injected ${skillEntries.length} skills: ${skillEntries.map((e) => e.name).join(", ")}`);
}

// ─── Output Parsing ─────────────────────────────────────────────────────────

function parseCodexJsonl(stdout) {
  const result = { sessionId: null, usage: null, summary: null, errorMessage: null };
  const lines = stdout.split("\n").filter(Boolean);
  let totalInput = 0, totalOutput = 0, totalCached = 0, hasUsage = false;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && event.thread_id) result.sessionId = event.thread_id;
      if (event.type === "turn.completed" && event.usage) {
        hasUsage = true;
        totalInput += event.usage.input_tokens || 0;
        totalOutput += event.usage.output_tokens || 0;
        totalCached += event.usage.cached_input_tokens || 0;
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        result.summary = event.item.text;
      }
      if (event.type === "error") result.errorMessage = event.message || "Unknown codex error";
    } catch { /* skip non-JSON */ }
  }

  if (hasUsage) result.usage = { inputTokens: totalInput, outputTokens: totalOutput, cachedInputTokens: totalCached };
  return result;
}

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

  const adapterType = agent.adapterType || "claude_local";

  // Resolve command — ignore stale/WSL commands
  const defaultCmd = DEFAULT_COMMANDS[adapterType] || DEFAULT_COMMANDS.claude_local;
  const command = (config.command && !isStaleLegacyCommand(config.command, adapterType))
    ? config.command
    : defaultCmd;

  // ── Workspace & Agent Home ──

  const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const agentHome = join(WORKSPACE_ROOT, "agents", safeName);
  let workspaceDir = agentHome;

  const instructionsFilePath = config.instructionsFilePath
    || join(WORKSPACE_ROOT, "agents", safeName, "AGENTS.md");

  // ── Session management ──

  const previousSessionParams = runtimeState?.sessionParams || null;
  const previousSessionId = previousSessionParams?.sessionId || runtimeState?.sessionId || null;
  const previousSessionCwd = previousSessionParams?.cwd || "";
  const canResume = previousSessionId
    && adapterType === "codex_local"
    && (!previousSessionCwd || previousSessionCwd === workspaceDir);

  // ── Ensure directories exist ──

  fs.mkdirSync(agentHome, { recursive: true });

  // ── Inject skills ──

  injectSkillsIfNeeded();

  // ── Write per-agent skills from adapterConfig.skills ──

  if (Array.isArray(config.skills) && config.skills.length > 0) {
    const agentSkillsBase = join(agentHome, ".claude", "skills");
    try {
      for (const skill of config.skills) {
        if (!skill.name || !skill.content) continue;
        const skillDir = join(agentSkillsBase, skill.name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(join(skillDir, "SKILL.md"), skill.content);
      }
      console.log(`  Wrote ${config.skills.length} per-agent skills for ${agent.name}`);
    } catch (err) {
      console.warn(`  Failed to write per-agent skills: ${err.message}`);
    }
  }

  // ── Model ──

  const model = config.model || DEFAULT_MODELS[adapterType] || "auto";

  console.log(`[run:${runId.slice(0, 8)}] ${agent.name} | ${adapterType} | ${model} | Session: ${canResume ? previousSessionId.slice(0, 8) + "..." : "new"}`);

  // ── Workflow step detection (needed early for env + prompt) ──

  const isWorkflowStep = !!(context.stepRunId || context.stepInstructions);
  const workflowContext = context.workflowContext || {};
  const stepInput = context.stepInput || {};

  // ── Build environment variables ──

  const issueId = context.issueId || context.taskId || "";
  const wakeReason = context.wakeReason || context.reason || "heartbeat_timer";
  const wakeCommentId = context.wakeCommentId || context.commentId || "";
  const approvalId = context.approvalId || "";
  const approvalStatus = context.approvalStatus || "";
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter(Boolean).join(",") : "";

  const env = {
    ...process.env,
    PAPERCLIP_API_URL: SERVER_URL,
    PAPERCLIP_RUN_ID: runId,
    PAPERCLIP_AGENT_ID: agent.id,
    PAPERCLIP_COMPANY_ID: agent.companyId,
    PAPERCLIP_WAKE_REASON: wakeReason,
    AGENT_HOME: agentHome,
  };

  // Never leak runner's server auth token to agent processes
  delete env.PAPERCLIP_RUNNER_TOKEN;

  if (authToken) env.PAPERCLIP_API_KEY = authToken;
  if (issueId) env.PAPERCLIP_TASK_ID = issueId;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds;

  // Workflow step env vars
  if (isWorkflowStep) {
    if (context.workflowRunId) env.PAPERCLIP_WORKFLOW_RUN_ID = context.workflowRunId;
    if (context.stepRunId) env.PAPERCLIP_STEP_RUN_ID = context.stepRunId;
    if (context.stepName) env.PAPERCLIP_STEP_NAME = context.stepName;
  }

  const workspaceContext = context.paperclipWorkspace || {};
  const workspaceHints = Array.isArray(context.paperclipWorkspaces) ? context.paperclipWorkspaces : [];
  env.PAPERCLIP_WORKSPACE_CWD = workspaceContext.cwd || workspaceDir;
  if (workspaceContext.source) env.PAPERCLIP_WORKSPACE_SOURCE = workspaceContext.source;
  if (workspaceContext.workspaceId) env.PAPERCLIP_WORKSPACE_ID = workspaceContext.workspaceId;
  if (workspaceContext.repoUrl) env.PAPERCLIP_WORKSPACE_REPO_URL = workspaceContext.repoUrl;
  if (workspaceContext.repoRef) env.PAPERCLIP_WORKSPACE_REPO_REF = workspaceContext.repoRef;
  if (workspaceHints.length > 0) env.PAPERCLIP_WORKSPACES_JSON = JSON.stringify(workspaceHints);

  // Inject agent-specific env vars
  if (config.env && typeof config.env === "object") {
    for (const [key, value] of Object.entries(config.env)) {
      env[key] = String(value);
    }
  }

  // ── Git credential setup ──

  const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (ghToken) {
    if (!env.GH_TOKEN) env.GH_TOKEN = ghToken;
    try {
      execSync(`git config --global credential.helper store`, { stdio: "ignore" });
      fs.writeFileSync(join(homedir(), ".git-credentials"),
        `https://x-access-token:${ghToken}@github.com\n`);
    } catch { /* best-effort */ }
  }

  // ── Project repo clone ──

  const repoUrl = workspaceContext.repoUrl;
  if (repoUrl && ghToken) {
    const repoSlug = repoUrl.replace(/.*\/\//, "").replace(/\.git$/, "").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
    const repoDir = join(WORKSPACE_ROOT, ".repos", repoSlug);
    const repoRef = workspaceContext.repoRef || "main";
    try {
      const authedUrl = repoUrl.replace("https://", `https://x-access-token:${ghToken}@`);
      if (fs.existsSync(join(repoDir, ".git"))) {
        execSync(`cd '${repoDir}' && git remote set-url origin '${authedUrl}' && git fetch origin '${repoRef}' --depth=1 2>/dev/null && git checkout -B '${repoRef}' 'origin/${repoRef}' 2>/dev/null || true`,
          { stdio: "ignore", timeout: 60000, shell: true });
      } else {
        fs.mkdirSync(dirname(repoDir), { recursive: true });
        execSync(`git clone --depth=1 --branch '${repoRef}' '${authedUrl}' '${repoDir}'`,
          { stdio: "ignore", timeout: 120000, shell: true });
      }
      workspaceDir = repoDir;
      console.log(`  Repo ready: ${repoUrl}`);
    } catch (err) {
      console.warn(`  Failed to clone ${repoUrl}: ${err.message}`);
    }
  }

  // ── Build prompt ──

  const instructionsPrefix = await loadInstructionsFile(instructionsFilePath);

  const templateData = {
    agent: { id: agent.id, name: agent.name, companyId: agent.companyId },
    run: { id: runId, source: isWorkflowStep ? "workflow" : "on_demand" },
    context,
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    // Flatten workflow context + step input so templates like {{projectSource}} resolve
    ...workflowContext,
    ...stepInput,
  };

  let renderedPrompt;

  if (isWorkflowStep && context.stepInstructions) {
    // Workflow agent_run step: use stepInstructions as the prompt
    const rawInstructions = context.stepInstructions;
    renderedPrompt = renderTemplate(rawInstructions, templateData);

    // Add workflow context summary so the agent knows what previous steps produced
    const prevStepOutputs = [];
    for (const [key, val] of Object.entries(workflowContext)) {
      if (typeof val === "object" && val !== null) {
        prevStepOutputs.push(`- ${key}: ${JSON.stringify(val).slice(0, 500)}`);
      } else if (val !== undefined && val !== null && val !== "") {
        prevStepOutputs.push(`- ${key}: ${String(val).slice(0, 300)}`);
      }
    }
    if (prevStepOutputs.length > 0) {
      renderedPrompt = `## Workflow Context (from previous steps & trigger inputs)\n${prevStepOutputs.join("\n")}\n\n## Your Task\n${renderedPrompt}`;
    }

    console.log(`  [workflow] Step: ${context.stepName || "unknown"} | Instructions: ${renderedPrompt.length} chars`);
  } else {
    // Normal heartbeat run
    const defaultTemplate = `Heartbeat run for {{agent.name}}. Wake reason: ${wakeReason}.`;
    const promptTemplate = config.promptTemplate || defaultTemplate;
    renderedPrompt = renderTemplate(promptTemplate, templateData);
  }

  const keyVars = [
    `PAPERCLIP_API_URL=${SERVER_URL}`,
    `PAPERCLIP_AGENT_ID=${agent.id}`,
    `PAPERCLIP_RUN_ID=${runId}`,
    `AGENT_HOME=${agentHome}`,
    issueId ? `PAPERCLIP_TASK_ID=${issueId}` : null,
    wakeReason !== "heartbeat_timer" ? `PAPERCLIP_WAKE_REASON=${wakeReason}` : null,
    wakeCommentId ? `PAPERCLIP_WAKE_COMMENT_ID=${wakeCommentId}` : null,
    isWorkflowStep ? `PAPERCLIP_WORKFLOW_RUN_ID=${context.workflowRunId || ""}` : null,
    isWorkflowStep ? `PAPERCLIP_STEP_RUN_ID=${context.stepRunId || ""}` : null,
  ].filter(Boolean).join("\n");
  const envNote = `Environment:\n\`\`\`\n${keyVars}\n\`\`\`\n\n`;
  const prompt = `${instructionsPrefix}${envNote}${renderedPrompt}`;

  // ── Build CLI args ──

  let args;

  if (adapterType === "codex_local") {
    args = ["exec", "--json", "-C", workspaceDir, "--skip-git-repo-check"];
    if (model) args.push("--model", model);
    const reasoningEffort = config.modelReasoningEffort || "low";
    args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    if (config.search) args.push("--search");
    if (config.dangerouslyBypassApprovalsAndSandbox !== false) args.push("--dangerously-bypass-approvals-and-sandbox");
    if (config.extraArgs?.length) args.push(...config.extraArgs);
    if (canResume) args.push("resume", previousSessionId, "-");
    else args.push("-");

  } else if (adapterType === "claude_local") {
    args = ["-p", "--verbose", "--output-format", "stream-json"];
    if (model) args.push("--model", model);
    if (config.dangerouslySkipPermissions !== false) args.push("--dangerously-skip-permissions");
    if (config.effort) args.push("--effort", config.effort);
    if (config.chrome) args.push("--chrome");
    if (config.maxTurnsPerRun) args.push("--max-turns", String(config.maxTurnsPerRun));
    // Per-agent skills via --add-dir
    const agentSkillsDir = join(agentHome, ".claude", "skills");
    try {
      if (fs.existsSync(agentSkillsDir) && fs.readdirSync(agentSkillsDir).length > 0) {
        args.push("--add-dir", agentHome);
      }
    } catch { /* no skills */ }
    if (config.extraArgs?.length) args.push(...config.extraArgs);

  } else {
    // Cursor / other
    args = ["-p", "--output-format", "stream-json", "--trust", "--yolo", "--workspace", workspaceDir];
    if (model) args.push("--model", model);
    if (config.extraArgs?.length) args.push(...config.extraArgs);
  }

  // ── Log buffering ──

  let logBuffer = [];
  const logsDir = join(PROJECT_ROOT, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const logFilePath = join(logsDir, `run-${runId}-${agent.name.replace(/[^a-z0-9]/gi, "_")}.log`);
  fs.writeFileSync(logFilePath, [
    `=== RUN ${runId} | ${agent.name} ===`,
    `Adapter: ${adapterType} | Model: ${model}`,
    `Workspace: ${workspaceDir}`,
    `Command: ${command} ${args.join(" ")}`,
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

  // ── Spawn ──

  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;

    const timeoutSec = config.timeoutSec != null ? config.timeoutSec : (isWorkflowStep ? 600 : 180);
    const timeoutTimer = timeoutSec > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        const graceSec = config.graceSec != null ? config.graceSec : 20;
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, graceSec * 1000);
      }, timeoutSec * 1000)
      : null;

    const child = spawn(command, args, {
      cwd: workspaceDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

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
      console.error(`[run:${runId.slice(0, 8)}] Spawn error: ${err.message}`);
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
        console.log(`[run:${runId.slice(0, 8)}] ${agent.name} exit=${code}`);

        let usage, sessionId, summary, costUsd, errorMessage;

        if (adapterType === "codex_local") {
          const parsed = parseCodexJsonl(stdoutBuf);
          usage = parsed.usage;
          sessionId = parsed.sessionId;
          summary = parsed.summary;
          errorMessage = parsed.errorMessage;
          if (canResume && code !== 0 && stderrBuf.includes("unknown session")) {
            sessionId = null;
          }
        } else {
          const parsed = parseStreamJsonUsage(stdoutBuf);
          usage = parsed.usage;
          costUsd = parsed.costUsd;
          summary = parsed.summary;
        }

        const sessionParams = sessionId ? {
          sessionId,
          cwd: workspaceDir,
          ...(workspaceContext.workspaceId ? { workspaceId: workspaceContext.workspaceId } : {}),
          ...(workspaceContext.repoUrl ? { repoUrl: workspaceContext.repoUrl } : {}),
          ...(workspaceContext.repoRef ? { repoRef: workspaceContext.repoRef } : {}),
        } : null;

        resolve({
          exitCode: code,
          signal: signal || null,
          timedOut,
          errorMessage: timedOut ? `Timed out after ${timeoutSec}s` : errorMessage || (code !== 0 ? `Exited ${code}` : null),
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
        });
      }).catch(() => {});
    });
  });
}

// ─── Poll & Claim ───────────────────────────────────────────────────────────

const activeAgentIds = new Set();

async function pollAndClaim(activeRunIds) {
  try {
    const pollResult = await apiFetch(`/runner/poll?adapterTypes=${ADAPTER_TYPES}`);
    if (!pollResult.run) return false;

    const { runId, agentId } = pollResult.run;
    if (activeRunIds.has(runId)) return false;
    if (activeAgentIds.has(agentId)) return false;

    const claimResult = await apiFetch(`/runner/claim/${runId}`, { method: "POST" });
    const { agent, run, runtime, authToken } = claimResult;

    const adType = agent.adapterType || "claude_local";
    const mdl = (agent.adapterConfig?.model) || DEFAULT_MODELS[adType] || "auto";
    console.log(`>> Claimed: ${agent.name} [${adType}/${mdl}] [${activeRunIds.size + 1}/${MAX_CONCURRENT_RUNS}]`);
    activeRunIds.add(runId);
    activeAgentIds.add(agent.id);

    executeRun(runId, agent, run.contextSnapshot || {}, authToken, runtime)
      .then(async (result) => {
        try {
          await apiFetch(`/runner/complete/${runId}`, {
            method: "POST",
            body: JSON.stringify(result),
          });
          const icon = result.exitCode === 0 ? "OK" : "FAIL";
          console.log(`<< ${icon}: ${agent.name} exit=${result.exitCode}`);
        } catch (err) {
          console.error(`!! Complete error ${runId}: ${err.message}`);
        }
      })
      .catch((err) => {
        console.error(`!! Runner crash ${runId}:`, err);
      })
      .finally(() => {
        activeRunIds.delete(runId);
        activeAgentIds.delete(agent.id);
      });

    return true;
  } catch (err) {
    if (!err.message.includes("409")) {
      console.error(`!! Poll error: ${err.message}`);
    }
    return false;
  }
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

async function pollLoop() {
  const activeRunIds = new Set();

  console.log("Paperclip Local Runner (macOS)");
  console.log(`  Server:      ${SERVER_URL}`);
  console.log(`  Adapters:    ${ADAPTER_TYPES}`);
  console.log(`  Concurrency: ${MAX_CONCURRENT_RUNS} | Poll: ${POLL_INTERVAL}ms`);
  console.log(`  Workspace:   ${WORKSPACE_ROOT}`);
  console.log(`  Skills:      ${SKILLS_DIR}`);
  console.log("");

  while (true) {
    if (activeRunIds.size < MAX_CONCURRENT_RUNS) {
      const claimed = await pollAndClaim(activeRunIds);
      if (claimed) {
        await sleep(100);
        continue;
      }
    }
    await sleep(activeRunIds.size >= MAX_CONCURRENT_RUNS ? 1000 : POLL_INTERVAL);
  }
}

pollLoop();
