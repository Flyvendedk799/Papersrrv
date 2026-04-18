/* ─────────────────────────────────────────────────────────────────────
 *  CompanionLegend — "How to read this scene".
 *
 *  Six tiny line-art icons next to a one-line plain-English explainer
 *  for each layer of the 3D scene (pillar, runs, comments, parents,
 *  sub-matters, approvals). It's the Rosetta Stone between the
 *  gorgeous 3D view and what it actually represents.
 *
 *  Icons are inline SVG (no external dep). Each row is also a <Jargon>
 *  trigger so a curious user can click-to-expand.
 * ───────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import { Jargon } from "../../Jargon";

interface LegendRow {
  icon: ReactNode;
  /** Short caption — the first word matches a glossary term. */
  label: string;
  /** Glossary term keyed in lib/glossary.ts. */
  term: string;
  /** Secondary sentence. */
  body: string;
}

const ROWS: LegendRow[] = [
  {
    icon: <PillarIcon />,
    label: "The pillar",
    term: "matter",
    body: "This case itself. Its color tells you its status.",
  },
  {
    icon: <OrbitIcon />,
    label: "Runs",
    term: "run",
    body: "Discs on the inner ring — each is one attempt by an agent.",
  },
  {
    icon: <CommentIcon />,
    label: "Correspondence",
    term: "correspondence",
    body: "Orbs on the outer ring — comments between you and the agents.",
  },
  {
    icon: <UpIcon />,
    label: "Parents",
    term: "ancestor",
    body: "Rings rising above — the larger work this is part of.",
  },
  {
    icon: <DownIcon />,
    label: "Sub-matters",
    term: "sub_matter",
    body: "Roots fanning down — smaller tasks spawned from this one.",
  },
  {
    icon: <PortalIcon />,
    label: "Approvals",
    term: "approval",
    body: "Portals at the top — decisions waiting for your sign-off.",
  },
];

export function CompanionLegend() {
  return (
    <section className="boared-reveal" style={{ animationDelay: "80ms" }}>
      <div
        className="font-mono uppercase mb-2"
        style={{
          fontSize: "0.56rem",
          letterSpacing: "0.32em",
          color: "var(--boared-ink-faint, #82827A)",
        }}
      >
        How to read this
      </div>

      <ul className="space-y-1.5">
        {ROWS.map((row) => (
          <li
            key={row.label}
            className="flex items-start gap-2.5"
            style={{ fontSize: "0.74rem", lineHeight: 1.35 }}
          >
            <span
              className="mt-[2px] shrink-0"
              style={{
                width: 14,
                height: 14,
                color: "var(--boared-ink-soft, currentColor)",
                opacity: 0.8,
              }}
              aria-hidden="true"
            >
              {row.icon}
            </span>
            <span style={{ color: "var(--boared-ink, inherit)" }}>
              <Jargon term={row.term}>
                <strong style={{ fontWeight: 600 }}>{row.label}</strong>
              </Jargon>
              <span
                style={{
                  color: "var(--boared-ink-soft, inherit)",
                  marginLeft: 6,
                }}
              >
                {row.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Line-art icons ──────────────────────────────────────────── */

function PillarIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="5.5" y="2" width="3" height="10" />
      <circle cx="7" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <ellipse cx="7" cy="7" rx="5.5" ry="2.2" />
      <circle cx="12.5" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="1.5" cy="7" r="0.7" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <ellipse cx="7" cy="6" rx="6" ry="2.8" />
      <circle cx="11" cy="6" r="0.9" fill="currentColor" stroke="none" opacity="0.8" />
      <circle cx="3" cy="6" r="0.9" fill="currentColor" stroke="none" opacity="0.6" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M7 1 L7 13" />
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="7" cy="8.5" r="1.1" opacity="0.7" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M7 1 L7 7" />
      <path d="M7 7 L3 13" />
      <path d="M7 7 L11 13" />
      <circle cx="3" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="13" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PortalIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="7" cy="7" r="5.5" />
      <circle cx="7" cy="7" r="2" />
    </svg>
  );
}
