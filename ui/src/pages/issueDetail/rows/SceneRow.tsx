/* ─────────────────────────────────────────────────────────────────────
 *  SceneRow — visual shell used by every scene-aware below-fold row.
 *
 *  Provides:
 *    · colored dot flush-left (the visual bridge to the 3D node)
 *    · hover accent (left border + background tint) when the matching
 *      scene node is hovered
 *    · pulse animation when data-pulse attribute is set (Companion
 *      "View in ↓" jumper stamps it for 1.2 s after scroll)
 *    · trailing "↗ 3D" chip that appears on hover; clicking it calls
 *      onSelect
 *
 *  The row itself is a plain div — not a button — because many rows
 *  already contain anchors / links. If the caller wants the whole row
 *  clickable, they can add an onClick to the root.
 * ───────────────────────────────────────────────────────────────────── */

import type { ReactNode, HTMLAttributes } from "react";
import type { RowIntegration } from "./useRowIntegration";

interface SceneRowProps extends HTMLAttributes<HTMLDivElement> {
  integration: RowIntegration;
  children: ReactNode;
  /** Whether to render the "↗ 3D" chip. Default true. */
  showJumpChip?: boolean;
  /** Extra classes on the row root. */
  className?: string;
}

export function SceneRow({
  integration,
  children,
  showJumpChip = true,
  className,
  ...rest
}: SceneRowProps) {
  const { id, dotColor, isHovered, onMouseEnter, onMouseLeave, onSelect } =
    integration;

  return (
    <div
      id={id}
      data-scene-row="true"
      className={`scene-row group flex items-start gap-3 relative ${className ?? ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        padding: "8px 10px",
        borderLeft: `2px solid ${
          isHovered ? "var(--boared-acid, currentColor)" : "transparent"
        }`,
        background: isHovered
          ? "var(--boared-paper-2, transparent)"
          : "transparent",
        transition: "background 160ms ease, border-color 160ms ease",
      }}
      {...rest}
    >
      <span
        aria-hidden
        className="scene-row-dot mt-[6px] shrink-0"
        style={{
          width: 8,
          height: 8,
          background: dotColor,
          boxShadow: isHovered ? `0 0 8px ${dotColor}` : undefined,
          transition: "box-shadow 160ms ease",
        }}
      />
      <div className="flex-1 min-w-0">{children}</div>
      {showJumpChip && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label="Jump to in 3D scene"
          className="scene-row-chip shrink-0 font-mono uppercase opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            fontSize: "0.52rem",
            letterSpacing: "0.2em",
            color: "var(--boared-acid, currentColor)",
            background: "transparent",
            border: `1px solid var(--boared-acid, currentColor)`,
            padding: "3px 6px",
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          ↗ 3D
        </button>
      )}
    </div>
  );
}
