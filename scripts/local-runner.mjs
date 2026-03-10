#!/usr/bin/env node
/**
 * Paperclip Local Runner
 *
 * Polls the Railway-hosted Paperclip server for queued runs, claims them,
 * executes the Cursor CLI locally (via WSL), and reports results back.
 *
 * Usage:
 *   $env:PAPERCLIP_SERVER_URL="https://papersrrv-production.up.railway.app"
 *   $env:PAPERCLIP_RUNNER_TOKEN="<your-token>"
 *   node scripts/local-runner.mjs
 *
 * Environment variables:
 *   PAPERCLIP_SERVER_URL  - URL of the Railway Paperclip server
 *   PAPERCLIP_RUNNER_TOKEN - Auth token matching the server's PAPERCLIP_RUNNER_TOKEN
 *   POLL_INTERVAL_MS      - Poll interval in ms (default: 3000)
 *   ADAPTER_TYPES         - Comma-separated adapter types to handle (default: cursor)
 *   MAX_CONCURRENT_RUNS   - Max concurrent runs (default: 5)
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SERVER_URL = process.env.PAPERCLIP_SERVER_URL;
const RUNNER_TOKEN = process.env.PAPERCLIP_RUNNER_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "3000", 10);
const ADAPTER_TYPES = process.env.ADAPTER_TYPES || "cursor";
const MAX_CONCURRENT_RUNS = parseInt(process.env.MAX_CONCURRENT_RUNS || "8", 10);

if (!SERVER_URL || !RUNNER_TOKEN) {
  console.error("ERROR: PAPERCLIP_SERVER_URL and PAPERCLIP_RUNNER_TOKEN are required");
  process.exit(1);
}

// Resolve project root from script location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(__dirname); // scripts/ -> project root

const headers = {
  Authorization: `Bearer ${RUNNER_TOKEN}`,
  "Content-Type": "application/json",
};

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
  } catch (err) {
    // Non-fatal: log streaming failure shouldn't kill the run
  }
}

// Map Railway paths back to local Windows paths
const LOCAL_AGENTS_DIR = process.env.PAPERCLIP_LOCAL_AGENTS_DIR
  || PROJECT_ROOT + "\\agents";

function resolveLocalPath(remotePath) {
  if (!remotePath) return null;
  if (remotePath.startsWith("/app/agents")) {
    return remotePath.replace("/app/agents", LOCAL_AGENTS_DIR).replace(/\//g, "\\");
  }
  if (remotePath.startsWith("/root/paperclip-agents")) {
    return remotePath.replace("/root/paperclip-agents", PROJECT_ROOT).replace(/\//g, "\\");
  }
  if (remotePath === "/app") return PROJECT_ROOT;
  return remotePath;
}

function resolveLocalCwd(remoteCwd) {
  if (!remoteCwd || remoteCwd === "/app/agents" || remoteCwd.startsWith("/app/")) {
    return LOCAL_AGENTS_DIR;
  }
  return remoteCwd;
}

async function loadInstructionsFile(filePath) {
  const localPath = resolveLocalPath(filePath);
  if (!localPath) return "";
  try {
    const contents = await readFile(localPath, "utf8");
    const dir = dirname(localPath) + "/";
    return (
      `${contents}\n\n` +
      `The above agent instructions were loaded from ${filePath}. ` +
      `Resolve any relative file references from ${dir}\n\n`
    );
  } catch {
    return "";
  }
}

async function executeRun(runId, agent, context, authToken) {
  const config = typeof agent.adapterConfig === "string"
    ? JSON.parse(agent.adapterConfig)
    : agent.adapterConfig || {};

  const command = config.command || "wsl -d Ubuntu -- /root/.local/bin/agent";
  const cwd = resolveLocalCwd(config.cwd);

  // Isolate workspaces to prevent parallel agents from locking each other out
  const baseWorkspace = (config.workspaceOverride || "/root/paperclip-agents").replace(/\/$/, "");
  const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const workspaceOverride = `${baseWorkspace}/.agent-workspaces/${safeName}`;

  // Ensure the local folder exists so Claude Code doesn't crash on startup
  const localAgentWorkspace = resolveLocalPath(workspaceOverride);
  if (localAgentWorkspace && !fs.existsSync(localAgentWorkspace)) {
    fs.mkdirSync(localAgentWorkspace, { recursive: true });
  }

  const model = config.model || "composer-1.5";

  console.log(`[run:${runId}] Agent: ${agent.name} (Started)`);

  const issueId = context.issueId || "";
  const wakeReason = context.wakeReason || context.reason || "heartbeat_timer";

  const env = {
    ...process.env,
    PAPERCLIP_API_URL: SERVER_URL + "/api",
    PAPERCLIP_RUN_ID: runId,
    PAPERCLIP_AGENT_ID: agent.id,
    PAPERCLIP_COMPANY_ID: agent.companyId,
    PAPERCLIP_WAKE_REASON: wakeReason,
  };

  if (authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  if (issueId) env.PAPERCLIP_TASK_ID = issueId;

  if (command.toLowerCase().startsWith("wsl ")) {
    const paperclipKeys = Object.keys(env).filter((k) => k.startsWith("PAPERCLIP_"));
    const existing = env.WSLENV || process.env.WSLENV || "";
    env.WSLENV = [...(existing ? [existing] : []), ...paperclipKeys].join(":");
  }

  const instructionsPrefix = await loadInstructionsFile(config.instructionsFilePath);
  const promptTemplate = config.promptTemplate || `Heartbeat run for ${agent.name}. Wake reason: ${wakeReason}`;
  const envPairs = Object.entries(env)
    .filter(([k]) => k.startsWith("PAPERCLIP_") && k !== "PAPERCLIP_RUNNER_TOKEN" && k !== "PAPERCLIP_SERVER_URL")
    .map(([k, v]) => `${k}=${k === "PAPERCLIP_API_KEY" ? "<redacted>" : v}`)
    .join("\n");
  const envNote = `The following PAPERCLIP_* environment variables are set in this run:\n\`\`\`\n${envPairs}\n\`\`\`\n\n`;
  const prompt = `${instructionsPrefix}${envNote}${promptTemplate}`;

  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = [...parts.slice(1), "-p", "--output-format", "stream-json", "--workspace", workspaceOverride];
  if (model) args.push("--model", model);
  if (config.dangerouslyBypassApprovalsAndSandbox) args.push("--yolo");

  // Log buffering & local file writing
  let logBuffer = [];
  const logsDir = join(PROJECT_ROOT, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const logFilePath = join(logsDir, `run-${runId}-${agent.name.replace(/[^a-z0-9]/gi, '_')}.log`);
  fs.writeFileSync(logFilePath, `=== STARTED RUN ${runId} for ${agent.name} ===\n`);
  fs.appendFileSync(logFilePath, `Workspace: ${workspaceOverride}\nCommand: ${cmd} ${args.join(" ")}\n`);

  const flushLogs = async () => {
    if (logBuffer.length === 0) return;
    const chunk = logBuffer.join("");
    logBuffer = [];
    fs.appendFileSync(logFilePath, chunk);
    await sendLog(runId, "stdout", chunk);
  };
  const logTimer = setInterval(flushLogs, 500);

  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;

    const timeoutSec = config.timeoutSec || 600;
    const timeoutTimer = timeoutSec > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutSec * 1000)
      : null;

    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

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
      flushLogs().catch(() => { });
      console.error(`[run:${runId}] Spawn error:`, err.message);
      resolve({
        exitCode: 1, signal: null, timedOut: false,
        errorMessage: err.message, errorCode: "spawn_error",
        stdoutExcerpt: stdoutBuf.slice(-4096), stderrExcerpt: stderrBuf.slice(-4096),
      });
    });

    child.on("close", (code, signal) => {
      clearInterval(logTimer);
      flushLogs().then(() => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        console.log(`[run:${runId}] Exited code=${code} signal=${signal}`);

        let usage = undefined;
        try {
          const lines = stdoutBuf.split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === "result" && parsed.usage) usage = parsed.usage;
              if (parsed.usage && parsed.type === "usage") usage = parsed.usage;
            } catch { }
          }
        } catch { }

        resolve({
          exitCode: code, signal: signal || null, timedOut,
          errorMessage: timedOut ? "Timed out" : (code !== 0 ? `Process exited with code ${code}` : null),
          errorCode: timedOut ? "timeout" : (code !== 0 ? "adapter_failed" : null),
          usage, stdoutExcerpt: stdoutBuf.slice(-4096), stderrExcerpt: stderrBuf.slice(-4096),
        });
      }).catch(() => { });
    });
  });
}

async function pollAndClaim(activeRunIds) {
  try {
    const pollResult = await apiFetch(`/runner/poll?adapterTypes=${ADAPTER_TYPES}`);
    if (!pollResult.run) return false;

    const { runId, agentId } = pollResult.run;
    if (activeRunIds.has(runId)) return false;

    console.log(`📥 Pickup: ${runId} (Agent ${agentId})`);
    const claimResult = await apiFetch(`/runner/claim/${runId}`, { method: "POST" });
    const { agent, run, authToken } = claimResult;

    console.log(`✅ Started: ${agent.name} [Running: ${activeRunIds.size + 1}/${MAX_CONCURRENT_RUNS}]`);
    activeRunIds.add(runId);

    executeRun(runId, agent, run.contextSnapshot || {}, authToken)
      .then(async (result) => {
        try {
          await apiFetch(`/runner/complete/${runId}`, {
            method: "POST",
            body: JSON.stringify(result),
          });
          console.log(`✅ Done: ${agent.name} (${runId})`);
        } catch (err) {
          console.error(`❌ Complete error ${runId}: ${err.message}`);
        }
      })
      .catch((err) => {
        console.error(`❌ Runner crash ${runId}:`, err);
      })
      .finally(() => {
        activeRunIds.delete(runId);
      });

    return true; // Found and claimed work
  } catch (err) {
    if (!err.message.includes("409")) {
      console.error(`❌ Poll/Claim error: ${err.message}`);
    }
    return false;
  }
}

async function pollLoop() {
  const activeRunIds = new Set();
  console.log(`🔄 Paperclip Local Runner started | Mode: Parallel`);
  console.log(`   Max concurrency: ${MAX_CONCURRENT_RUNS} | Interval: ${POLL_INTERVAL}ms\n`);

  while (true) {
    if (activeRunIds.size < MAX_CONCURRENT_RUNS) {
      // Try to pick up one job
      const claimed = await pollAndClaim(activeRunIds);
      if (claimed) {
        // If we found something, try to pick up another one immediately
        await sleep(100);
        continue;
      }
    }

    // No work found or at capacity, wait for the poll interval
    await sleep(activeRunIds.size >= MAX_CONCURRENT_RUNS ? 1000 : POLL_INTERVAL);
  }
}

pollLoop();
