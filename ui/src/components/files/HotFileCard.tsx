/**
 * HotFileCard — the hero tile on the Overview's "Hot files" lane.
 *
 * Communicates four signals at a glance:
 *   1. *What* file — filename + directory breadcrumb.
 *   2. *Why it's hot* — churn count + 7/30-day sparkline.
 *   3. *Who's touching it* — agent avatar stack.
 *   4. *Where it belongs* — project dot + name, if scoped.
 *
 * Click to jump to the Reader for this file.
 */

import type { HotFile } from "@paperclipai/shared";
import { TrendingUp } from "lucide-react";
import { ChurnSparkline } from "./ChurnSparkline";
import { AgentPresenceChip } from "./AgentPresenceChip";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}
function dirnameOf(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function HotFileCard({
  file,
  onOpen,
  className,
}: {
  file: HotFile;
  onOpen?: (filePath: string) => void;
  className?: string;
}) {
  const name = filenameOf(file.filePath);
  const dir = dirnameOf(file.filePath);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(file.filePath)}
      className={cn(
        "group text-left w-[260px] shrink-0 rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper)] px-3 py-2.5 flex flex-col gap-2",
        "hover:border-foreground/40 hover:bg-[var(--boared-paper-2)] transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring outline-none",
        className,
      )}
      aria-label={`Open ${file.filePath}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {file.projectColor ? (
          <span
            aria-hidden
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: file.projectColor }}
            title={file.projectName ?? undefined}
          />
        ) : (
          <span aria-hidden className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
        )}
        <span className="truncate font-medium text-sm text-foreground">{name}</span>
      </div>

      {dir && (
        <div className="truncate font-mono text-[0.6rem] text-muted-foreground">
          {dir}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        <ChurnSparkline values={file.sparkline} width={110} height={22} />
        <div className="flex items-baseline gap-1 font-mono">
          <TrendingUp className="h-3 w-3 text-foreground/70" />
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {file.churn}
          </span>
          <span className="text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
            changes
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        {file.agents.length > 0 ? (
          <AgentPresenceChip agents={file.agents} reason="touched" />
        ) : (
          <span className="text-[0.6rem] font-mono text-muted-foreground">
            no agent data
          </span>
        )}
        <span className="font-mono text-[0.58rem] text-muted-foreground shrink-0">
          {timeAgo(file.lastCapturedAt)}
        </span>
      </div>

      {file.projectName && (
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground truncate">
          {file.projectName}
        </div>
      )}
    </button>
  );
}
