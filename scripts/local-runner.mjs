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
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SERVER_URL = process.env.PAPERCLIP_SERVER_URL;
const RUNNER_TOKEN = process.env.PAPERCLIP_RUNNER_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "3000", 10);
const ADAPTER_TYPES = process.env.ADAPTER_TYPES || "cursor";

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
  // Map /app/agents/... -> local agents dir
  if (remotePath.startsWith("/app/agents")) {
    return remotePath.replace("/app/agents", LOCAL_AGENTS_DIR).replace(/\//g, "\\");
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
  const workspaceOverride = config.workspaceOverride || "/root/paperclip-agents";
  const model = config.model || "composer-1.5";

  console.log(`[run:${runId}] Agent: ${agent.name}`);
  console.log(`[run:${runId}] Command: ${command}`);
  console.log(`[run:${runId}] CWD: ${cwd}`);

  // Build context env vars (matching the real adapter)
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

  // Set auth token so agents can call the API
  if (authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  if (issueId) env.PAPERCLIP_TASK_ID = issueId;
  if (context.wakeCommentId || context.commentId) env.PAPERCLIP_WAKE_COMMENT_ID = context.wakeCommentId || context.commentId;
  if (context.approvalId) env.PAPERCLIP_APPROVAL_ID = context.approvalId;
  if (context.approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = context.approvalStatus;

  // WSL env forwarding: list all PAPERCLIP_* keys in WSLENV
  if (command.toLowerCase().startsWith("wsl ")) {
    const paperclipKeys = Object.keys(env).filter((k) => k.startsWith("PAPERCLIP_"));
    const existing = env.WSLENV || process.env.WSLENV || "";
    env.WSLENV = [...(existing ? [existing] : []), ...paperclipKeys].join(":");
  }

  // Build prompt: instructions prefix + env note + prompt template
  const instructionsPrefix = await loadInstructionsFile(config.instructionsFilePath);
  const promptTemplate = config.promptTemplate || `Heartbeat run for ${agent.name}. Wake reason: ${wakeReason}`;

  // Build env note (same as real adapter)
  const envPairs = Object.entries(env)
    .filter(([k]) => k.startsWith("PAPERCLIP_") && k !== "PAPERCLIP_RUNNER_TOKEN" && k !== "PAPERCLIP_SERVER_URL")
    .map(([k, v]) => `${k}=${k === "PAPERCLIP_API_KEY" ? "<redacted>" : v}`)
    .join("\n");
  const envNote = `The following PAPERCLIP_* environment variables are set in this run:\n\`\`\`\n${envPairs}\n\`\`\`\n\n`;

  const prompt = `${instructionsPrefix}${envNote}${promptTemplate}`;

  // Parse command into parts
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = [...parts.slice(1), "-p", "--output-format", "stream-json", "--workspace", workspaceOverride];

  if (model) args.push("--model", model);

  const autoTrust = config.dangerouslyBypassApprovalsAndSandbox;
  if (autoTrust) args.push("--yolo");

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

    console.log(`[run:${runId}] Spawning: ${cmd} ${args.join(" ")}`);

    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pass prompt via stdin (same as the real cursor adapter)
    if (prompt) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdoutBuf += chunk;
      process.stdout.write(chunk);
      sendLog(runId, "stdout", chunk);
    });

    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderrBuf += chunk;
      process.stderr.write(chunk);
      sendLog(runId, "stderr", chunk);
    });

    child.on("error", (err) => {
      console.error(`[run:${runId}] Spawn error:`, err.message);
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: err.message,
        errorCode: "spawn_error",
        stdoutExcerpt: stdoutBuf.slice(-4096),
        stderrExcerpt: stderrBuf.slice(-4096),
      });
    });

    child.on("close", (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      console.log(`[run:${runId}] Exited: code=${code} signal=${signal} timedOut=${timedOut}`);

      // Try to extract usage from the result line in stream-json output
      let usage = undefined;
      try {
        const lines = stdoutBuf.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "result" && parsed.usage) {
              usage = parsed.usage;
            }
            if (parsed.usage && parsed.type === "usage") {
              usage = parsed.usage;
            }
          } catch { /* skip non-JSON lines */ }
        }
      } catch { /* ignore */ }

      resolve({
        exitCode: code,
        signal: signal || null,
        timedOut,
        errorMessage: timedOut ? "Timed out" : (code !== 0 ? `Process exited with code ${code}` : null),
        errorCode: timedOut ? "timeout" : (code !== 0 ? "adapter_failed" : null),
        usage,
        stdoutExcerpt: stdoutBuf.slice(-4096),
        stderrExcerpt: stderrBuf.slice(-4096),
      });
    });
  });
}

async function pollLoop() {
  console.log(`🔄 Paperclip Local Runner started`);
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   Adapter types: ${ADAPTER_TYPES}`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`   Agents dir: ${LOCAL_AGENTS_DIR}`);
  console.log("");

  while (true) {
    try {
      // Poll for queued run
      const pollResult = await apiFetch(`/runner/poll?adapterTypes=${ADAPTER_TYPES}`);

      if (!pollResult.run) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      const { runId, agentId } = pollResult.run;
      console.log(`\n📥 Found queued run: ${runId} for agent ${agentId}`);

      // Claim the run (includes auth token for agent API calls)
      let claimResult;
      try {
        claimResult = await apiFetch(`/runner/claim/${runId}`, { method: "POST" });
      } catch (err) {
        console.log(`⚠️  Could not claim run ${runId}: ${err.message}`);
        await sleep(1000);
        continue;
      }

      const { agent, run, runtime, authToken } = claimResult;
      console.log(`✅ Claimed run ${runId} for ${agent.name}`);

      // Execute with auth token
      const result = await executeRun(runId, agent, run.contextSnapshot || {}, authToken);

      // Report completion
      await apiFetch(`/runner/complete/${runId}`, {
        method: "POST",
        body: JSON.stringify(result),
      });

      console.log(`✅ Completed run ${runId}: ${result.exitCode === 0 ? "succeeded" : "failed"}`);
    } catch (err) {
      console.error(`❌ Poll error: ${err.message}`);
      await sleep(POLL_INTERVAL);
    }
  }
}

pollLoop();
