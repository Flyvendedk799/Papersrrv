/**
 * CaseParticipants — the roster of agents who touched this case.
 *
 * Pulled from the synthesis graph's delegation nodes. Each row is
 * one agent: their seeded color as a chip, their name, their
 * attempt count, and their outcome pip. Clicking a row fires the
 * `paperclip:case-graph-select` event so the graph scrolls + focuses
 * their delegation.
 *
 * Rendered inside the sidebar so readers see "who worked on this"
 * at a glance alongside the other properties.
 */

import { useCallback } from "react";
import { cn } from "../../../lib/utils";
import type { CaseSynthesisPayload } from "../../../api/issues";
import { agentColor } from "./agentColor";

interface Props {
  synthesis: CaseSynthesisPayload | null;
  className?: string;
}

interface Participant {
  id: string;
  name: string;
  attempts: number;
  outcome: "live" | "resolved" | "stuck" | "done" | null;
}

export function CaseParticipants({ synthesis, className }: Props) {
  const participants = extractParticipants(synthesis);

  const onSelect = useCallback((id: string) => {
    window.dispatchEvent(
      new CustomEvent("paperclip:case-graph-select", { detail: { id } }),
    );
    document
      .getElementById("chapter-graph")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (participants.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
        Participants
      </div>
      <ul className="flex flex-col gap-1">
        {participants.map((p) => {
          const color = agentColor(p.name);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="w-full group flex items-center gap-2 px-1.5 py-1.5 -mx-1.5 hover:bg-[var(--boared-paper-2)]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/20"
                title={`${p.name} · ${p.attempts} ${p.attempts === 1 ? "attempt" : "attempts"}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full font-mono text-[0.54rem] text-[var(--boared-ink)] tracking-[0.04em] font-semibold shrink-0 border"
                  style={{
                    background: `color-mix(in oklab, ${color.tint} 28%, transparent)`,
                    borderColor: color.tint,
                  }}
                >
                  {monogram(p.name)}
                </span>
                <span className="flex-1 min-w-0 font-serif italic text-[0.88rem] leading-none text-[var(--boared-ink)] truncate text-left">
                  {p.name}
                </span>
                <span
                  className={cn(
                    "font-mono text-[0.52rem] uppercase tracking-[0.14em] tabular-nums shrink-0",
                    p.outcome === "live"
                      ? "text-[var(--boared-acid)]"
                      : p.outcome === "stuck"
                        ? "text-[var(--boared-warn)]"
                        : p.outcome === "resolved" || p.outcome === "done"
                          ? "text-[var(--boared-success)]"
                          : "text-[var(--boared-ink-faint)]",
                  )}
                >
                  {p.attempts}×
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ──────────── helpers ──────────── */

function extractParticipants(synthesis: CaseSynthesisPayload | null): Participant[] {
  if (!synthesis) return [];
  const out: Participant[] = [];
  for (const n of synthesis.graph.nodes) {
    if (n.kind !== "delegation") continue;
    const match = n.sublabel?.match(/^(\d+)\s+attempt[s]?\s*·\s*(.+)$/);
    const attempts = match ? parseInt(match[1], 10) : 0;
    const outcome = (match?.[2] ?? "").toLowerCase();
    const live = n.status === "live";
    const resolved = outcome.includes("resolved") || outcome.includes("done");
    const stuck = outcome.includes("stuck") || outcome.includes("failed");
    const resolvedOutcome: Participant["outcome"] = live
      ? "live"
      : resolved
        ? "resolved"
        : stuck
          ? "stuck"
          : outcome.length > 0
            ? "done"
            : null;
    out.push({
      id: n.id,
      name: n.authorName ?? n.label.replace(/^Delegated to /, ""),
      attempts,
      outcome: resolvedOutcome,
    });
  }
  // Sort by attempts desc — the case's centre of gravity first.
  out.sort((a, b) => b.attempts - a.attempts);
  return out;
}

function monogram(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
