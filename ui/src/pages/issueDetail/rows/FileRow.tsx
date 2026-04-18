/* ─────────────────────────────────────────────────────────────────────
 *  FileRow — one file snapshot in the Files touched section.
 *
 *  Files don't have their own 3D representation (yet). We bridge each
 *  file row to the RUN orb that produced it — clicking the ↗ 3D chip
 *  flies to that run's orb, hovering halos it.
 *
 *  If the file's owning run isn't in the scene graph (capped by
 *  RUN_LIMIT), we skip the scene-aware adornments and render plainly.
 * ───────────────────────────────────────────────────────────────────── */

import { cn } from "../../../lib/utils";
import { relativeTime } from "../../../lib/utils";
import { FileText } from "lucide-react";
import type { FileSnapshot } from "@paperclipai/shared";
import { SceneRow } from "./SceneRow";
import { useRowIntegration } from "./useRowIntegration";
import type { RunNode } from "../../../components/issueScene/data/types";

interface FileRowProps {
  snap: FileSnapshot;
  isActive: boolean;
  /** The matching run node, if one exists in the graph. */
  runNode?: RunNode;
  onClick: () => void;
}

export function FileRow({ snap, isActive, runNode, onClick }: FileRowProps) {
  const opClass =
    snap.operation === "delete"
      ? "text-destructive"
      : snap.operation === "write" || snap.operation === "edit"
        ? "text-[var(--boared-acid)]"
        : "text-muted-foreground";

  const body = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 text-[0.82rem] text-left",
        isActive && "bg-foreground/[0.05]",
      )}
      style={{ padding: "2px 0" }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono text-[0.72rem]">{snap.filePath}</span>
      {snap.operation && (
        <span
          className={cn(
            "font-mono text-[0.6rem] uppercase tracking-[0.08em] shrink-0",
            opClass,
          )}
        >
          {snap.operation}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {snap.agentName && (
          <span className="font-mono text-[0.6rem] text-muted-foreground/60">
            {snap.agentName}
          </span>
        )}
        <span className="font-mono text-[0.6rem] text-muted-foreground tabular-nums">
          {relativeTime(snap.capturedAt)}
        </span>
      </span>
    </button>
  );

  if (!runNode) return body;

  return (
    <SceneRow integration={useRowIntegration({ kind: "run", data: runNode })}>
      {body}
    </SceneRow>
  );
}
