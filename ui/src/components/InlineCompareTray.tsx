/**
 * Inline compare tray (backlog 2.0 B2 / 1.5 A3).
 *
 * Opens a compact side-by-side diff drawer at the bottom of a host
 * surface (issue relevance panel, comment evidence, etc) without
 * unmounting the parent. Lets a reviewer see "what changed" in the
 * file without navigating away from context.
 *
 * Latest two snapshots are picked by default; user can pick any prior
 * snapshot from the history dropdown.
 */

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronDown } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { startFilePerf, markFilePerf } from "../lib/filePerf";
import { cn } from "../lib/utils";
import type { FileSnapshot } from "@paperclipai/shared";

interface Props {
  companyId: string;
  filePath: string;
  onClose: () => void;
}

interface DiffLine {
  type: "same" | "add" | "remove";
  lineNum?: number;
  content: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const changes: Array<{ type: "same" | "add" | "remove"; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.unshift({ type: "same", line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      changes.unshift({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }
  const result: DiffLine[] = [];
  let lineNum = 0;
  for (const c of changes) {
    if (c.type !== "remove") lineNum++;
    result.push({
      type: c.type,
      lineNum: c.type !== "remove" ? lineNum : undefined,
      content: c.line,
    });
  }
  return result;
}

export function InlineCompareTray({ companyId, filePath, onClose }: Props) {
  const perfStopRef = useMemo(() => ({ stop: startFilePerf("diff_launch", { filePath }) }), [filePath]);
  const [showOnlyChanges, setShowOnlyChanges] = useState(true);
  const [aIdx, setAIdx] = useState(1);
  const [bIdx, setBIdx] = useState(0);

  const { data: history } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath),
    queryFn: () => filesApi.history(companyId, filePath),
    enabled: !!companyId && !!filePath,
  });

  const snapshots: FileSnapshot[] = history ?? [];
  const left = snapshots[aIdx];
  const right = snapshots[bIdx];

  const { data: leftContent } = useQuery({
    queryKey: queryKeys.files.content(companyId, left?.contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, left!.contentHash!),
    enabled: !!left?.contentHash,
  });
  const { data: rightContent } = useQuery({
    queryKey: queryKeys.files.content(companyId, right?.contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, right!.contentHash!),
    enabled: !!right?.contentHash,
  });

  const diff = useMemo(() => {
    if (!leftContent || !rightContent) return null;
    return computeDiff(leftContent.content, rightContent.content);
  }, [leftContent, rightContent]);

  useEffect(() => {
    if (diff) perfStopRef.stop();
  }, [diff, perfStopRef]);

  useEffect(() => {
    const t0 = performance.now();
    return () => markFilePerf("diff_launch", performance.now() - t0, { filePath, reason: "unmount" });
  }, [filePath]);

  const changesCount = diff?.filter((d) => d.type !== "same").length ?? 0;
  const filtered = showOnlyChanges && diff ? collapseSame(diff) : diff;

  return (
    <div className="border-t border-[var(--boared-rule)] bg-[var(--boared-paper)]">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--boared-rule)]">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
          Compare
        </span>
        <span className="truncate text-xs text-foreground">{filePath}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
            <input
              type="checkbox"
              checked={showOnlyChanges}
              onChange={(e) => setShowOnlyChanges(e.target.checked)}
            />
            changes only
          </label>
          {snapshots.length >= 2 && (
            <>
              <Picker
                label="A"
                value={aIdx}
                options={snapshots}
                onChange={setAIdx}
              />
              <Picker
                label="B"
                value={bIdx}
                options={snapshots}
                onChange={setBIdx}
              />
            </>
          )}
          <button
            onClick={onClose}
            aria-label="Close compare"
            className="p-1 hover:text-[var(--boared-acid)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="max-h-[420px] overflow-auto font-mono text-[11px] leading-[1.4]">
        {!left || !right ? (
          <div className="px-3 py-3 text-muted-foreground">
            Need at least two snapshots to compare.
          </div>
        ) : !diff ? (
          <div className="px-3 py-3 text-muted-foreground">Loading diff…</div>
        ) : changesCount === 0 ? (
          <div className="px-3 py-3 text-muted-foreground">No differences.</div>
        ) : (
          <table className="w-full">
            <tbody>
              {filtered!.map((d, i) => (
                <tr key={i} className={cn(
                  d.type === "add" && "bg-green-500/10",
                  d.type === "remove" && "bg-red-500/10",
                )}>
                  <td className="w-10 text-right pr-2 text-muted-foreground select-none">
                    {d.lineNum ?? ""}
                  </td>
                  <td className="w-4 text-center select-none">
                    {d.type === "add" ? "+" : d.type === "remove" ? "-" : " "}
                  </td>
                  <td className="whitespace-pre-wrap break-words py-0.5 pr-3">
                    {d.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function collapseSame(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];
  let sameRun = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.type === "same") {
      sameRun++;
      if (sameRun <= 2) out.push(ln);
      else if (sameRun === 3) out.push({ type: "same", content: "  …" });
      continue;
    }
    sameRun = 0;
    out.push(ln);
  }
  return out;
}

function Picker({
  label, value, options, onChange,
}: {
  label: string;
  value: number;
  options: FileSnapshot[];
  onChange: (idx: number) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none bg-transparent border border-[var(--boared-rule)] text-[0.65rem] pl-2 pr-5 py-0.5 font-mono"
        aria-label={`Snapshot ${label}`}
      >
        {options.map((s, i) => (
          <option key={s.id} value={i}>
            {label}: {new Date(s.capturedAt).toLocaleString()}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  );
}
