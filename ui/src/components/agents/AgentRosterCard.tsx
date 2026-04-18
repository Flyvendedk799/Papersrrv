/**
 * AgentRosterCard — dense, scannable tile for one agent.
 *
 * Used by the Agents roster grid view. Pulls together the information a
 * user needs to pick the right agent at a glance:
 *
 *   - big status dot (pulsing when the agent is live)
 *   - byline-style name + role/title
 *   - live-run chip when there's an active run
 *   - adapter + model chip
 *   - last-heartbeat time
 *   - budget glance (spend / month) as a tiny capsule bar
 *
 * Cards use the newspaper "hairline box" convention from the design
 * guide — single-pixel rule, paper-2 background on hover, no shadows.
 */

import { Link } from "@/lib/router";
import { Bot } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { agentUrl, agentRouteRef, cn, relativeTime } from "@/lib/utils";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw: "OpenClaw",
  openclaw_gateway: "OpenClaw GW",
  process: "Process",
  http: "HTTP",
};

export interface AgentRosterCardProps {
  agent: Agent;
  liveRun?: { runId: string; liveCount: number };
  selected?: boolean;
  onFocus?: () => void;
  className?: string;
}

export function AgentRosterCard({
  agent,
  liveRun,
  selected,
  onFocus,
  className,
}: AgentRosterCardProps) {
  const dot = agentStatusDot[agent.status] ?? agentStatusDotDefault;
  const live = !!liveRun;
  const adapterLabel = adapterLabels[agent.adapterType] ?? agent.adapterType;
  const model = (agent.adapterConfig as Record<string, unknown>)?.model as string | undefined;
  const spendRatio =
    agent.budgetMonthlyCents > 0
      ? Math.min(1, Math.max(0, agent.spentMonthlyCents / agent.budgetMonthlyCents))
      : null;

  return (
    <Link
      to={agentUrl(agent)}
      onFocus={onFocus}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex flex-col gap-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-3",
        "no-underline text-inherit transition-colors",
        "hover:bg-[var(--boared-paper-2)] hover:border-foreground",
        selected && "border-foreground ring-1 ring-foreground/20",
        live && "ring-1 ring-[var(--boared-acid)]/30",
        className,
      )}
    >
      {/* Header: status dot + name + live chip */}
      <div className="flex items-start gap-2 min-w-0">
        <span className="relative mt-1 inline-flex h-2.5 w-2.5 shrink-0">
          <span className={cn("absolute inline-flex h-full w-full", dot)} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="truncate text-[0.95rem] font-medium text-foreground">
              {agent.name}
            </span>
            {live && (
              <LiveChip runId={liveRun!.runId} agentRef={agentRouteRef(agent)} liveCount={liveRun!.liveCount} />
            )}
          </div>
          <div className="truncate font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
            {agent.role}
            {agent.title ? ` · ${agent.title}` : ""}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap min-h-[1.25rem]">
        <AdapterChip adapter={adapterLabel} model={model} />
        <span className="font-mono text-[0.58rem] text-muted-foreground tabular-nums">
          {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "never"}
        </span>
        <span className="ml-auto">
          <StatusBadge status={agent.status} />
        </span>
      </div>

      {spendRatio !== null && (
        <div
          className="h-1 w-full bg-[var(--boared-paper-2)] border border-[var(--boared-rule)] overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(spendRatio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Budget used"
          title={`${Math.round(spendRatio * 100)}% of monthly budget used`}
        >
          <span
            className={cn(
              "block h-full",
              spendRatio >= 0.9
                ? "bg-[var(--boared-acid)]"
                : spendRatio >= 0.5
                  ? "bg-foreground"
                  : "bg-foreground/60",
            )}
            style={{ width: `${Math.round(spendRatio * 100)}%` }}
          />
        </div>
      )}

      {!agent.lastHeartbeatAt && !live && (
        <div className="flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
          <Bot className="h-3 w-3" />
          not yet seen
        </div>
      )}
    </Link>
  );
}

function AdapterChip({ adapter, model }: { adapter: string; model?: string }) {
  return (
    <span className="inline-flex items-center gap-1 border border-[var(--boared-rule)] px-1.5 py-0.5 font-mono text-[0.58rem] text-muted-foreground">
      <span className="text-foreground">{adapter}</span>
      {model && (
        <span className="truncate max-w-[120px]" title={model}>
          · {model}
        </span>
      )}
    </span>
  );
}

function LiveChip({
  runId,
  agentRef,
  liveCount,
}: {
  runId: string;
  agentRef: string;
  liveCount: number;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-1.5 h-4 border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)] hover:text-[var(--boared-acid-ink)] transition-colors no-underline font-mono text-[0.54rem] uppercase tracking-[0.08em]"
    >
      <span className="relative flex h-1 w-1">
        <span className="animate-ping absolute inline-flex h-full w-full bg-[var(--boared-acid)] opacity-75" />
        <span className="relative inline-flex h-1 w-1 bg-[var(--boared-acid)]" />
      </span>
      Live{liveCount > 1 ? ` ×${liveCount}` : ""}
    </Link>
  );
}
