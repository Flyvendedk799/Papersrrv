/**
 * AgentRosterRow — dense single-line row for List view of the roster.
 *
 * Optimised for ruthless scanning: status dot, name, role/title, adapter
 * chip with model, live indicator, last heartbeat, and a status badge
 * on the right. Anchored with a hairline separator per the design guide.
 */

import { Link } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { agentRouteRef, agentUrl, cn, relativeTime } from "@/lib/utils";

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

export interface AgentRosterRowProps {
  agent: Agent;
  liveRun?: { runId: string; liveCount: number };
  selected?: boolean;
  className?: string;
}

export function AgentRosterRow({ agent, liveRun, selected, className }: AgentRosterRowProps) {
  const dot = agentStatusDot[agent.status] ?? agentStatusDotDefault;
  const adapterLabel = adapterLabels[agent.adapterType] ?? agent.adapterType;
  const model = (agent.adapterConfig as Record<string, unknown>)?.model as string | undefined;
  const live = !!liveRun;

  return (
    <Link
      to={agentUrl(agent)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid items-center gap-3 px-2 py-2 border-b border-[var(--boared-rule)]",
        "grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto_auto]",
        "hover:bg-[var(--boared-paper-2)] transition-colors no-underline text-inherit",
        selected && "bg-[var(--boared-paper-2)]",
        className,
      )}
    >
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
        <span className={cn("absolute inline-flex h-full w-full", dot)} />
      </span>

      <div className="min-w-0 flex items-baseline gap-2">
        <span className="truncate text-foreground text-[0.82rem]">{agent.name}</span>
        <span className="truncate font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
          {agent.role}
          {agent.title ? ` · ${agent.title}` : ""}
        </span>
      </div>

      <div className="hidden sm:flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1 border border-[var(--boared-rule)] px-1.5 py-0.5 font-mono text-[0.58rem] text-muted-foreground max-w-full">
          <span className="text-foreground shrink-0">{adapterLabel}</span>
          {model && (
            <span className="truncate" title={model}>
              · {model}
            </span>
          )}
        </span>
      </div>

      <div className="hidden sm:flex items-center justify-end">
        {live ? (
          <LiveChipInline agent={agent} liveRun={liveRun!} />
        ) : null}
      </div>

      <div className="hidden sm:block font-mono text-[0.58rem] text-muted-foreground tabular-nums text-right">
        {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "—"}
      </div>

      <div className="flex items-center justify-end">
        <StatusBadge status={agent.status} />
      </div>
    </Link>
  );
}

function LiveChipInline({
  agent,
  liveRun,
}: {
  agent: Agent;
  liveRun: { runId: string; liveCount: number };
}) {
  return (
    <Link
      to={`/agents/${agentRouteRef(agent)}/runs/${liveRun.runId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-1.5 h-5 border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)] hover:text-[var(--boared-acid-ink)] transition-colors no-underline font-mono text-[0.54rem] uppercase tracking-[0.08em]"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full bg-[var(--boared-acid)] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 bg-[var(--boared-acid)]" />
      </span>
      Live{liveRun.liveCount > 1 ? ` ×${liveRun.liveCount}` : ""}
    </Link>
  );
}
