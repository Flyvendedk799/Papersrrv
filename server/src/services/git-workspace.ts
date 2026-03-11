import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../middleware/logger.js";

const execAsync = promisify(exec);

interface GitStatus {
  initialized: boolean;
  branch: string | null;
  commitCount: number;
  lastCommitHash: string | null;
  lastCommitMessage: string | null;
  lastCommitDate: string | null;
  dirtyFiles: number;
  untrackedFiles: number;
}

interface CommitInfo {
  hash: string;
  message: string;
  date: string;
  filesChanged: number;
}

async function gitExec(cwd: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd, timeout: 15000 });
    return stdout.trim();
  } catch (err: any) {
    if (err.stderr?.includes("not a git repository")) return "";
    throw err;
  }
}

export function gitWorkspaceService() {
  return {
    /** Check if a directory is a git repo, and get status */
    async status(workspacePath: string): Promise<GitStatus> {
      try {
        await fs.access(path.join(workspacePath, ".git"));
      } catch {
        return { initialized: false, branch: null, commitCount: 0, lastCommitHash: null, lastCommitMessage: null, lastCommitDate: null, dirtyFiles: 0, untrackedFiles: 0 };
      }

      const branch = await gitExec(workspacePath, "rev-parse --abbrev-ref HEAD").catch(() => null);
      const commitCount = parseInt(await gitExec(workspacePath, "rev-list --count HEAD").catch(() => "0"), 10);
      const lastLog = await gitExec(workspacePath, "log -1 --format=%H|||%s|||%aI").catch(() => "");
      const [lastCommitHash, lastCommitMessage, lastCommitDate] = lastLog.split("|||");

      const statusOutput = await gitExec(workspacePath, "status --porcelain").catch(() => "");
      const lines = statusOutput.split("\n").filter(l => l.trim());
      const dirtyFiles = lines.filter(l => !l.startsWith("??")).length;
      const untrackedFiles = lines.filter(l => l.startsWith("??")).length;

      return {
        initialized: true,
        branch: branch || null,
        commitCount,
        lastCommitHash: lastCommitHash || null,
        lastCommitMessage: lastCommitMessage || null,
        lastCommitDate: lastCommitDate || null,
        dirtyFiles,
        untrackedFiles,
      };
    },

    /** Initialize git in a workspace */
    async init(workspacePath: string): Promise<void> {
      await execAsync("git init", { cwd: workspacePath });
      await execAsync('git config user.email "agent@paperclip.local"', { cwd: workspacePath });
      await execAsync('git config user.name "Paperclip Agent"', { cwd: workspacePath });
      // Create initial commit
      await execAsync("git add -A", { cwd: workspacePath });
      await execAsync('git commit --allow-empty -m "Initial workspace"', { cwd: workspacePath });
      logger.info({ workspacePath }, "git-workspace: initialized");
    },

    /** Auto-commit changes after an agent run */
    async commitAfterRun(workspacePath: string, runId: string, agentName: string): Promise<CommitInfo | null> {
      const status = await gitExec(workspacePath, "status --porcelain");
      if (!status.trim()) return null; // nothing to commit

      await execAsync("git add -A", { cwd: workspacePath });
      const message = `Agent run: ${agentName} (${runId.slice(0, 8)})`;
      await execAsync(`git commit -m "${message}"`, { cwd: workspacePath });

      const log = await gitExec(workspacePath, "log -1 --format=%H|||%s|||%aI");
      const [hash, msg, date] = log.split("|||");
      const diffStat = await gitExec(workspacePath, "diff HEAD~1 --stat --numstat");
      const filesChanged = diffStat.split("\n").filter(l => l.trim()).length;

      return { hash: hash || "", message: msg || message, date: date || new Date().toISOString(), filesChanged };
    },

    /** Get commit history for a workspace */
    async log(workspacePath: string, limit = 50): Promise<CommitInfo[]> {
      const output = await gitExec(workspacePath, `log --format=%H|||%s|||%aI -${limit}`);
      if (!output) return [];
      return output.split("\n").filter(l => l.trim()).map(line => {
        const [hash, message, date] = line.split("|||");
        return { hash: hash || "", message: message || "", date: date || "", filesChanged: 0 };
      });
    },

    /** Get diff between two commits or between a commit and working tree */
    async diff(workspacePath: string, fromRef: string, toRef?: string): Promise<string> {
      const refs = toRef ? `${fromRef} ${toRef}` : fromRef;
      return gitExec(workspacePath, `diff ${refs}`);
    },

    /** Show file content at a specific commit */
    async showFileAtCommit(workspacePath: string, commitHash: string, filePath: string): Promise<string | null> {
      try {
        return await gitExec(workspacePath, `show ${commitHash}:${filePath}`);
      } catch {
        return null;
      }
    },
  };
}
