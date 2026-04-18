/* ─────────────────────────────────────────────────────────────────────
 *  HoverLabel3D — a world-space floating label that appears next to
 *  the node under the cursor.
 *
 *  Uses drei <Html transform> with a small Boared-paper card. The
 *  label reads the node's kind + primary name + a short meta string,
 *  so hovering reads the sphere like an interactive diagram.
 *
 *  Rendered inside the Canvas so it billboards with the camera.
 * ───────────────────────────────────────────────────────────────────── */

import { Html } from "@react-three/drei";
import type { SceneTarget, Vec3 } from "../data/types";

function formatRelative(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function buildLabel(target: SceneTarget): {
  kind: string;
  title: string;
  meta: string;
  color: string;
} | null {
  switch (target.kind) {
    case "run":
      return {
        kind: "Run",
        title: target.data.agentName ?? "agent",
        meta: [target.data.isLive ? "LIVE" : "DONE", formatRelative(target.data.startedAt)]
          .filter(Boolean)
          .join(" · "),
        color: target.data.color,
      };
    case "comment":
      return {
        kind: "Comment",
        title: target.data.authorName ?? "—",
        meta: formatRelative(target.data.createdAt),
        color: target.data.color,
      };
    case "event":
      return {
        kind: "Activity",
        title: target.data.verb ?? "event",
        meta: [target.data.actorName, formatRelative(target.data.createdAt)]
          .filter(Boolean)
          .join(" · "),
        color: target.data.color,
      };
    case "ancestor":
      return {
        kind: "Parent",
        title: target.data.title ?? target.data.identifier,
        meta: target.data.identifier ?? "",
        color: "#1A1A18",
      };
    case "descendant":
      return {
        kind: target.data.kind === "mention" ? "Mention" : "Sub-matter",
        title: target.data.title ?? target.data.identifier,
        meta: target.data.identifier ?? "",
        color: "#1A1A18",
      };
    case "approval":
      return {
        kind: "Approval",
        title: target.data.status.toUpperCase(),
        meta: target.data.decidedAt
          ? `Decided ${formatRelative(target.data.decidedAt)}`
          : `Requested ${formatRelative(target.data.requestedAt)}`,
        color:
          target.data.status === "pending"
            ? "#B45309"
            : target.data.status === "approved"
              ? "#176B3A"
              : target.data.status === "rejected"
                ? "#B22B1A"
                : "#1A1A18",
      };
    case "issue":
      return null;
  }
}

interface HoverLabel3DProps {
  target: SceneTarget | null;
  position: Vec3 | null;
}

export function HoverLabel3D({ target, position }: HoverLabel3DProps) {
  if (!target || !position) return null;
  const label = buildLabel(target);
  if (!label) return null;

  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      zIndexRange={[50, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background:
            "color-mix(in oklch, var(--boared-paper, #F2F0EA) 94%, transparent)",
          border: "1px solid var(--boared-rule, #D8D6CF)",
          borderRadius: 4,
          padding: "6px 9px",
          minWidth: 140,
          maxWidth: 260,
          color: "var(--boared-ink, #1A1A18)",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, monospace",
          boxShadow:
            "0 6px 18px color-mix(in oklch, var(--boared-ink, #1A1A18) 22%, transparent)",
          transform: "translateY(-44px)",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.5rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--boared-ink-soft, #3F3F3A)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: 999,
              background: label.color,
              boxShadow: `0 0 6px ${label.color}`,
            }}
          />
          <span>{label.kind}</span>
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--boared-ink, #1A1A18)",
            maxWidth: 240,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label.title}
        </div>
        {label.meta && (
          <div
            style={{
              marginTop: 2,
              fontSize: "0.62rem",
              color: "var(--boared-ink-faint, #82827A)",
            }}
          >
            {label.meta}
          </div>
        )}
      </div>
    </Html>
  );
}
