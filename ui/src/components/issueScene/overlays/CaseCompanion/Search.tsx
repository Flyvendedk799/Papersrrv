/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion / Search — find anywhere, fly anywhere.
 *
 *  Fuzzy-matches against:
 *    · agent names (runs, comments authored by agents)
 *    · issue identifiers (ancestors, descendants)
 *    · comment bodies (first N chars, case-insensitive substring)
 *    · activity actor names + verbs
 *
 *  Shows matches as a mini-list. Click = selectAndFocus. Scene-level
 *  dimming of non-matches happens by the IssueScene reading the same
 *  searchQuery from context (future: scene dims via filters.searchHits).
 *
 *  Deliberately simple — no weighted scoring or tokenization; the case
 *  universe is small and substring is enough. Debounce happens via
 *  the input's controlled value being owned by context (not by us).
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type { IssueGraph, SceneTarget } from "../../data/types";
import { colorForNode } from "../../colors";
import {
  useSceneActions,
  useSetHover,
  targetToRef,
} from "../../state/SceneStateContext";
import { CompanionHeader } from "./header";

interface SearchProps {
  graph: IssueGraph;
  query: string;
  onClose: () => void;
}

export function Search({ graph, query, onClose }: SearchProps) {
  const actions = useSceneActions();
  const setHover = useSetHover();

  const hits = useMemo(() => matchGraph(graph, query), [graph, query]);

  return (
    <div>
      <CompanionHeader
        title={`Search · ${hits.length} ${hits.length === 1 ? "hit" : "hits"}`}
        subtitle={`"${query}"`}
        onClose={onClose}
        closeLabel="Clear"
      />
      {hits.length === 0 ? (
        <div
          className="text-center py-6"
          style={{
            color: "var(--boared-ink-faint, inherit)",
            fontSize: "0.8rem",
          }}
        >
          Nothing in this case matches.
        </div>
      ) : (
        <ul className="space-y-1">
          {hits.slice(0, 12).map((h, i) => (
            <li key={`${h.target.kind}:${i}`}>
              <button
                type="button"
                onClick={() => actions.selectAndFocus(h.target)}
                onMouseEnter={() => setHover(targetToRef(h.target))}
                onMouseLeave={() => setHover(null)}
                className="w-full text-left flex items-start gap-2 transition-colors"
                style={{
                  padding: "6px 8px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--boared-ink, inherit)",
                  borderLeft: "2px solid transparent",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background =
                    "var(--boared-paper-2, transparent)";
                  e.currentTarget.style.borderLeftColor =
                    "var(--boared-acid, currentColor)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderLeftColor = "transparent";
                }}
              >
                <span
                  aria-hidden
                  className="mt-[5px] shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    background: colorForNode(h.target),
                  }}
                />
                <span className="flex-1 min-w-0">
                  <span
                    className="block truncate text-sm"
                    style={{ color: "var(--boared-ink, inherit)" }}
                  >
                    {h.primary}
                  </span>
                  <span
                    className="block truncate font-mono"
                    style={{
                      fontSize: "0.56rem",
                      letterSpacing: "0.1em",
                      color: "var(--boared-ink-faint, inherit)",
                      marginTop: 1,
                    }}
                  >
                    {h.secondary}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 font-mono"
                  style={{
                    fontSize: "0.54rem",
                    letterSpacing: "0.18em",
                    color: "var(--boared-ink-faint, currentColor)",
                    marginTop: 4,
                  }}
                >
                  ↗
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Matcher ──────────────────────────────────────────────────── */

interface Hit {
  target: SceneTarget;
  primary: string;
  secondary: string;
}

function matchGraph(graph: IssueGraph, rawQuery: string): Hit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  const matches = (s: string | undefined | null) =>
    !!s && s.toLowerCase().includes(q);

  // Ancestors
  for (const a of graph.ancestors) {
    if (matches(a.title) || matches(a.identifier)) {
      hits.push({
        target: { kind: "ancestor", data: a },
        primary: a.title,
        secondary: `Parent · § ${a.identifier}`,
      });
    }
  }

  // Descendants
  for (const d of graph.descendants) {
    if (matches(d.title) || matches(d.identifier)) {
      hits.push({
        target: { kind: "descendant", data: d },
        primary: d.title,
        secondary: `${d.kind === "direct" ? "Sub-matter" : "Mention"} · § ${d.identifier}`,
      });
    }
  }

  // Runs
  for (const r of graph.runs) {
    if (matches(r.agentName) || matches(r.runId)) {
      hits.push({
        target: { kind: "run", data: r },
        primary: r.agentName,
        secondary: `Run · ${r.runId.slice(0, 8)} · ${r.payload.status}`,
      });
    }
  }

  // Comments
  for (const c of graph.comments) {
    if (matches(c.authorName) || matches(c.bodyPreview)) {
      hits.push({
        target: { kind: "comment", data: c },
        primary: c.authorName,
        secondary: `Comment · ${c.bodyPreview.slice(0, 40)}`,
      });
    }
  }

  // Events
  for (const e of graph.events) {
    if (matches(e.actorName) || matches(e.verb)) {
      hits.push({
        target: { kind: "event", data: e },
        primary: e.actorName,
        secondary: `Activity · ${e.verb}`,
      });
    }
  }

  return hits;
}
