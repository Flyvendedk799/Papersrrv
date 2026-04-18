import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Issue, LiveEvent } from "@paperclipai/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { getUIAdapter } from "../adapters";
import type { TranscriptEntry } from "../adapters";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";


type FeedTone = "info" | "warn" | "error" | "assistant" | "tool";

interface FeedItem {
  id: string;
  ts: string;
  runId: string;
  agentId: string;
  agentName: string;
  text: string;
  tone: FeedTone;
  dedupeKey: string;
  streamingKind?: "assistant" | "thinking";
}

const MAX_FEED_ITEMS = 40;
const MAX_FEED_TEXT_LENGTH = 220;
const MAX_STREAMING_TEXT_LENGTH = 4000;
const MIN_DASHBOARD_RUNS = 4;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function summarizeEntry(entry: TranscriptEntry): { text: string; tone: FeedTone } | null {
  if (entry.kind === "assistant") {
    const text = entry.text.trim();
    return text ? { text, tone: "assistant" } : null;
  }
  if (entry.kind === "thinking") {
    const text = entry.text.trim();
    return text ? { text: `[thinking] ${text}`, tone: "info" } : null;
  }
  if (entry.kind === "tool_call") {
    return { text: `tool ${entry.name}`, tone: "tool" };
  }
  if (entry.kind === "tool_result") {
    const base = entry.content.trim();
    return {
      text: entry.isError ? `tool error: ${base}` : `tool result: ${base}`,
      tone: entry.isError ? "error" : "tool",
    };
  }
  if (entry.kind === "stderr") {
    const text = entry.text.trim();
    return text ? { text, tone: "error" } : null;
  }
  if (entry.kind === "system") {
    const text = entry.text.trim();
    return text ? { text, tone: "warn" } : null;
  }
  if (entry.kind === "stdout") {
    const text = entry.text.trim();
    return text ? { text, tone: "info" } : null;
  }
  return null;
}

function createFeedItem(
  run: LiveRunForIssue,
  ts: string,
  text: string,
  tone: FeedTone,
  nextId: number,
  options?: {
    streamingKind?: "assistant" | "thinking";
    preserveWhitespace?: boolean;
  },
): FeedItem | null {
  if (!text.trim()) return null;
  const base = options?.preserveWhitespace ? text : text.trim();
  const maxLength = options?.streamingKind ? MAX_STREAMING_TEXT_LENGTH : MAX_FEED_TEXT_LENGTH;
  const normalized = base.length > maxLength ? base.slice(-maxLength) : base;
  return {
    id: `${run.id}:${nextId}`,
    ts,
    runId: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    text: normalized,
    tone,
    dedupeKey: `feed:${run.id}:${ts}:${tone}:${normalized}`,
    streamingKind: options?.streamingKind,
  };
}

function parseStdoutChunk(
  run: LiveRunForIssue,
  chunk: string,
  ts: string,
  pendingByRun: Map<string, string>,
  nextIdRef: MutableRefObject<number>,
): FeedItem[] {
  const pendingKey = `${run.id}:stdout`;
  const combined = `${pendingByRun.get(pendingKey) ?? ""}${chunk}`;
  const split = combined.split(/\r?\n/);
  pendingByRun.set(pendingKey, split.pop() ?? "");
  const adapter = getUIAdapter(run.adapterType);

  const summarized: Array<{ text: string; tone: FeedTone; streamingKind?: "assistant" | "thinking" }> = [];
  const appendSummary = (entry: TranscriptEntry) => {
    if (entry.kind === "assistant" && entry.delta) {
      const text = entry.text;
      if (!text.trim()) return;
      const last = summarized[summarized.length - 1];
      if (last && last.streamingKind === "assistant") {
        last.text += text;
      } else {
        summarized.push({ text, tone: "assistant", streamingKind: "assistant" });
      }
      return;
    }

    if (entry.kind === "thinking" && entry.delta) {
      const text = entry.text;
      if (!text.trim()) return;
      const last = summarized[summarized.length - 1];
      if (last && last.streamingKind === "thinking") {
        last.text += text;
      } else {
        summarized.push({ text: `[thinking] ${text}`, tone: "info", streamingKind: "thinking" });
      }
      return;
    }

    const summary = summarizeEntry(entry);
    if (!summary) return;
    summarized.push({ text: summary.text, tone: summary.tone });
  };

  const items: FeedItem[] = [];
  for (const line of split.slice(-8)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = adapter.parseStdoutLine(trimmed, ts);
    if (parsed.length === 0) {
      const fallback = createFeedItem(run, ts, trimmed, "info", nextIdRef.current++);
      if (fallback) items.push(fallback);
      continue;
    }
    for (const entry of parsed) {
      appendSummary(entry);
    }
  }

  for (const summary of summarized) {
    const item = createFeedItem(run, ts, summary.text, summary.tone, nextIdRef.current++, {
      streamingKind: summary.streamingKind,
      preserveWhitespace: !!summary.streamingKind,
    });
    if (item) items.push(item);
  }

  return items;
}

function parseStderrChunk(
  run: LiveRunForIssue,
  chunk: string,
  ts: string,
  pendingByRun: Map<string, string>,
  nextIdRef: MutableRefObject<number>,
): FeedItem[] {
  const pendingKey = `${run.id}:stderr`;
  const combined = `${pendingByRun.get(pendingKey) ?? ""}${chunk}`;
  const split = combined.split(/\r?\n/);
  pendingByRun.set(pendingKey, split.pop() ?? "");

  const items: FeedItem[] = [];
  for (const line of split.slice(-8)) {
    const item = createFeedItem(run, ts, line, "error", nextIdRef.current++);
    if (item) items.push(item);
  }
  return items;
}

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
}

export function ActiveAgentsPanel({ companyId }: ActiveAgentsPanelProps) {
  const [feedByRun, setFeedByRun] = useState<Map<string, FeedItem[]>>(new Map());
  const seenKeysRef = useRef(new Set<string>());
  const pendingByRunRef = useRef(new Map<string, string>());
  const nextIdRef = useRef(1);

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MIN_DASHBOARD_RUNS),
  });

  const runs = liveRuns ?? [];
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: runs.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  const runById = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  const activeRunIds = useMemo(() => new Set(runs.filter(isRunActive).map((r) => r.id)), [runs]);

  // Clean up pending buffers for runs that ended
  useEffect(() => {
    const stillActive = new Set<string>();
    for (const runId of activeRunIds) {
      stillActive.add(`${runId}:stdout`);
      stillActive.add(`${runId}:stderr`);
    }
    for (const key of pendingByRunRef.current.keys()) {
      if (!stillActive.has(key)) {
        pendingByRunRef.current.delete(key);
      }
    }
  }, [activeRunIds]);

  // WebSocket connection for streaming
  useEffect(() => {
    if (activeRunIds.size === 0) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const appendItems = (runId: string, items: FeedItem[]) => {
      if (items.length === 0) return;
      setFeedByRun((prev) => {
        const next = new Map(prev);
        const existing = [...(next.get(runId) ?? [])];
        for (const item of items) {
          if (seenKeysRef.current.has(item.dedupeKey)) continue;
          seenKeysRef.current.add(item.dedupeKey);

          const last = existing[existing.length - 1];
          if (
            item.streamingKind &&
            last &&
            last.runId === item.runId &&
            last.streamingKind === item.streamingKind
          ) {
            const mergedText = `${last.text}${item.text}`;
            const nextText =
              mergedText.length > MAX_STREAMING_TEXT_LENGTH
                ? mergedText.slice(-MAX_STREAMING_TEXT_LENGTH)
                : mergedText;
            existing[existing.length - 1] = {
              ...last,
              ts: item.ts,
              text: nextText,
              dedupeKey: last.dedupeKey,
            };
            continue;
          }

          existing.push(item);
        }
        if (seenKeysRef.current.size > 6000) {
          seenKeysRef.current.clear();
        }
        next.set(runId, existing.slice(-MAX_FEED_ITEMS));
        return next;
      });
    };

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (message) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;

        let event: LiveEvent;
        try {
          event = JSON.parse(raw) as LiveEvent;
        } catch {
          return;
        }

        if (event.companyId !== companyId) return;
        const payload = event.payload ?? {};
        const runId = readString(payload["runId"]);
        if (!runId || !activeRunIds.has(runId)) return;

        const run = runById.get(runId);
        if (!run) return;

        if (event.type === "heartbeat.run.event") {
          const seq = typeof payload["seq"] === "number" ? payload["seq"] : null;
          const eventType = readString(payload["eventType"]) ?? "event";
          const messageText = readString(payload["message"]) ?? eventType;
          const dedupeKey = `${runId}:event:${seq ?? `${eventType}:${messageText}:${event.createdAt}`}`;
          if (seenKeysRef.current.has(dedupeKey)) return;
          seenKeysRef.current.add(dedupeKey);
          if (seenKeysRef.current.size > 6000) seenKeysRef.current.clear();
          const tone = eventType === "error" ? "error" : eventType === "lifecycle" ? "warn" : "info";
          const item = createFeedItem(run, event.createdAt, messageText, tone, nextIdRef.current++);
          if (item) appendItems(run.id, [item]);
          return;
        }

        if (event.type === "heartbeat.run.status") {
          const status = readString(payload["status"]) ?? "updated";
          const dedupeKey = `${runId}:status:${status}:${readString(payload["finishedAt"]) ?? ""}`;
          if (seenKeysRef.current.has(dedupeKey)) return;
          seenKeysRef.current.add(dedupeKey);
          if (seenKeysRef.current.size > 6000) seenKeysRef.current.clear();
          const tone = status === "failed" || status === "timed_out" ? "error" : "warn";
          const item = createFeedItem(run, event.createdAt, `run ${status}`, tone, nextIdRef.current++);
          if (item) appendItems(run.id, [item]);
          return;
        }

        if (event.type === "heartbeat.run.log") {
          const chunk = readString(payload["chunk"]);
          if (!chunk) return;
          const stream = readString(payload["stream"]) === "stderr" ? "stderr" : "stdout";
          if (stream === "stderr") {
            appendItems(run.id, parseStderrChunk(run, chunk, event.createdAt, pendingByRunRef.current, nextIdRef));
            return;
          }
          appendItems(run.id, parseStdoutChunk(run, chunk, event.createdAt, pendingByRunRef.current, nextIdRef));
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "active_agents_panel_unmount");
      }
    };
  }, [activeRunIds, companyId, runById]);

  const activeCount = runs.filter(isRunActive).length;

  return (
    <section className="mb-12">
      {/* Editorial section header — no card chrome */}
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-[var(--boared-rule)]">
        <span className="boared-label text-foreground">Correspondents</span>
        <span className="font-mono text-[0.6rem] text-muted-foreground tracking-tight tabular-nums flex items-center gap-3">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="size-1.5 bg-[var(--boared-acid)] animate-pulse" />
              {activeCount} ON THE WIRE
            </span>
          )}
          <span>{runs.length} ENTRIES</span>
        </span>
      </div>

      {runs.length === 0 ? (
        <p className="font-mono text-[0.72rem] text-muted-foreground py-3">
          No correspondents on duty.
        </p>
      ) : (
        <div className="border-t border-foreground divide-y divide-[var(--boared-rule)]">
          {runs.map((run) => (
            <CorrespondentRow
              key={run.id}
              run={run}
              issue={run.issueId ? issueById.get(run.issueId) : undefined}
              feed={feedByRun.get(run.id) ?? []}
              isActive={isRunActive(run)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * CorrespondentRow — a single editorial register entry for an agent.
 *
 * Replaces the SaaS "agent run card with embedded scrolling log" with a
 * one-line byline that reads like a press box note: name, current dispatch,
 * last action, age. The full transcript still exists in the data layer
 * (and is reachable by clicking through to the run detail page), but it
 * doesn't take up a card slot on the dashboard.
 */
function CorrespondentRow({
  run,
  issue,
  feed,
  isActive,
}: {
  run: LiveRunForIssue;
  issue?: Issue;
  feed: FeedItem[];
  isActive: boolean;
}) {
  // The latest dispatch — newest non-empty entry from the feed.
  const latest = useMemo(() => {
    for (let i = feed.length - 1; i >= 0; i--) {
      const item = feed[i];
      if (item && item.text.trim().length > 0) return item;
    }
    return null;
  }, [feed]);

  const dispatchText = latest?.text.replace(/\s+/g, " ").trim() ?? null;
  const truncated = dispatchText && dispatchText.length > 110 ? dispatchText.slice(0, 110) + "…" : dispatchText;

  return (
    <Link
      to={`/agents/${run.agentId}/runs/${run.id}`}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3 px-1 no-underline text-inherit hover:bg-foreground/[0.025] transition-colors group/corr"
    >
      {/* Top row: byline + status code + age */}
      <div className="col-span-1 flex items-center gap-2 shrink-0">
        {isActive ? (
          <span className="size-1.5 bg-[var(--boared-acid)] animate-pulse" aria-hidden />
        ) : (
          <span className="size-1.5 bg-muted-foreground/40" aria-hidden />
        )}
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-foreground truncate max-w-[18ch]">
          {run.agentName}
        </span>
      </div>

      {/* Subject — issue identifier + title */}
      <div className="col-span-1 min-w-0 text-[0.82rem] leading-snug text-foreground truncate">
        {run.issueId ? (
          <>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground mr-2">
              {issue?.identifier ?? run.issueId.slice(0, 8)}
            </span>
            <span className="truncate">{issue?.title ?? "—"}</span>
          </>
        ) : (
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground">
            Free-form task
          </span>
        )}
      </div>

      {/* Right meta: status + age */}
      <div className="col-span-1 flex items-center gap-3 shrink-0 font-mono text-[0.6rem] uppercase tracking-[0.06em] text-muted-foreground tabular-nums">
        <span>
          {isActive
            ? "Active"
            : run.status === "failed"
              ? "Failed"
              : run.status === "timed_out"
                ? "Timeout"
                : "Closed"}
        </span>
        <span>·</span>
        <span>{relativeTime(run.finishedAt ?? run.createdAt)}</span>
      </div>

      {/* Bottom row: latest dispatch (italic muted), spans subject column */}
      <div className="col-start-2 col-end-3 min-w-0">
        {truncated ? (
          <span
            className={cn(
              "block truncate font-mono text-[0.7rem] italic",
              latest?.tone === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            "{truncated}"
          </span>
        ) : isActive ? (
          <span className="block font-mono text-[0.68rem] italic text-muted-foreground/70">
            Waiting for the wire…
          </span>
        ) : (
          <span className="block font-mono text-[0.68rem] italic text-muted-foreground/70">
            Closed.
          </span>
        )}
      </div>
    </Link>
  );
}
