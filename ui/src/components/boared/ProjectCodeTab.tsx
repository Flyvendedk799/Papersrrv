/**
 * ProjectCodeTab — renders the "Code" tab under a Project.
 *
 * Branches on project.source.kind:
 *   - github         : pull request list + summary header
 *   - local_archive  : file tree browser
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Github, File, Folder, ChevronRight, ChevronDown } from "lucide-react";
import type {
  GithubPullRequestListResult,
  Project,
  ProjectArchiveEntry,
} from "@paperclipai/shared";
import { projectsApi } from "../../api/projects";
import { queryKeys } from "../../lib/queryKeys";
import { cn, relativeTime } from "../../lib/utils";
import { SkeletonList } from "./Skeleton";

export function ProjectCodeTab({ project }: { project: Project }) {
  if (project.source.kind === "github") {
    return <GithubCodeView project={project} />;
  }
  if (project.source.kind === "local_archive") {
    return <ArchiveCodeView project={project} />;
  }
  return null;
}

/* ------------------------------ GitHub view ------------------------------ */

function GithubCodeView({ project }: { project: Project }) {
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(project.id), "pulls", state],
    queryFn: () =>
      projectsApi.listPullRequests(project.id, state, project.companyId) as Promise<
        GithubPullRequestListResult
      >,
  });

  const github = project.source.github;
  if (!github) return null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between border-b border-[var(--boared-rule)] pb-3">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-[var(--boared-ink-faint)]" aria-hidden="true" />
          <span className="font-serif italic text-[1.1rem]">
            {github.owner}/{github.repo}
          </span>
          {github.defaultBranch && (
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] ml-2">
              · {github.defaultBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(["open", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={cn(
                "px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.14em] border border-transparent transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                state === s
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {isLoading && <SkeletonList rows={4} />}
      {error && (
        <p className="font-mono text-[0.7rem] text-destructive">
          {error instanceof Error ? error.message : "Failed to load pull requests"}
        </p>
      )}
      {data && (
        <ul className="divide-y divide-[var(--boared-rule)] border border-[var(--boared-rule)]">
          {data.items.length === 0 && (
            <li className="p-6 text-center font-serif italic text-[0.95rem] text-[var(--boared-ink-faint)]">
              No {state === "all" ? "" : state + " "}pull requests.
            </li>
          )}
          {data.items.map((pr) => (
            <li key={pr.number} className="p-3 hover:bg-[var(--boared-paper-2)]/40 transition-colors">
              <a
                href={pr.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="no-underline block text-inherit"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif italic text-[1rem] text-[var(--boared-ink)] truncate">
                    #{pr.number} {pr.title}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[0.54rem] uppercase tracking-[0.14em] shrink-0",
                      pr.state === "open"
                        ? "text-[var(--boared-acid)]"
                        : pr.state === "closed"
                          ? "text-[var(--boared-ink-faint)]"
                          : "text-[var(--boared-ink-faint)]",
                    )}
                  >
                    {pr.state}
                  </span>
                </div>
                <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-1">
                  {pr.authorLogin ?? "unknown"}
                  {pr.updatedAt && <> · {relativeTime(pr.updatedAt)}</>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Archive view ----------------------------- */

interface TreeNode {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
  entry?: ProjectArchiveEntry;
}

function buildTree(entries: ProjectArchiveEntry[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    size: 0,
    isDirectory: true,
    children: new Map(),
  };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i]!;
      const path = parts.slice(0, i + 1).join("/");
      const isLeaf = i === parts.length - 1;
      let next = cursor.children.get(name);
      if (!next) {
        next = {
          name,
          path,
          size: 0,
          isDirectory: !isLeaf || entry.isDirectory,
          children: new Map(),
        };
        cursor.children.set(name, next);
      }
      if (isLeaf && !entry.isDirectory) {
        next.size = entry.sizeBytes;
        next.entry = entry;
      }
      cursor = next;
    }
  }
  return root;
}

function ArchiveCodeView({ project }: { project: Project }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(project.id), "archive-files"],
    queryFn: () => projectsApi.listArchiveFiles(project.id, undefined, project.companyId),
  });

  const tree = useMemo(() => (data ? buildTree(data) : null), [data]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [selected, setSelected] = useState<ProjectArchiveEntry | null>(null);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <aside className="md:col-span-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)] max-h-[70vh] overflow-auto">
        <header className="px-3 py-2 border-b border-[var(--boared-rule)] font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Files · {project.source.archive?.entryCount ?? 0}
        </header>
        {isLoading && <div className="p-3"><SkeletonList rows={6} /></div>}
        {error && (
          <p className="p-3 font-mono text-[0.7rem] text-destructive">
            {error instanceof Error ? error.message : "Failed to load files"}
          </p>
        )}
        {tree && (
          <ul className="p-1 text-[0.8rem]">
            <TreeRender
              node={tree}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onSelect={setSelected}
              selectedId={selected?.id}
            />
          </ul>
        )}
      </aside>
      <section className="md:col-span-3 border border-[var(--boared-rule)] bg-[var(--boared-paper)] min-h-[40vh]">
        {selected ? (
          <FilePreview entry={selected} />
        ) : (
          <div className="h-full flex items-center justify-center p-6 font-serif italic text-[0.95rem] text-[var(--boared-ink-faint)]">
            Select a file to preview.
          </div>
        )}
      </section>
    </div>
  );
}

function TreeRender({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (entry: ProjectArchiveEntry) => void;
  selectedId: string | undefined;
}) {
  const sorted = [...node.children.values()].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <>
      {sorted.map((child) => {
        const isOpen = expanded.has(child.path);
        const isSelected = child.entry?.id === selectedId;
        return (
          <li key={child.path} className="list-none">
            <button
              type="button"
              onClick={() => {
                if (child.isDirectory) onToggle(child.path);
                else if (child.entry) onSelect(child.entry);
              }}
              className={cn(
                "flex items-center gap-1 w-full text-left px-1.5 py-0.5 hover:bg-[var(--boared-paper-2)]/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                isSelected && "bg-[var(--boared-acid)]/10 text-[var(--boared-acid)]",
              )}
              style={{ paddingLeft: `${depth * 0.75 + 0.375}rem` }}
            >
              {child.isDirectory ? (
                isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                )
              ) : (
                <span className="w-3" />
              )}
              {child.isDirectory ? (
                <Folder className="h-3 w-3 shrink-0 text-[var(--boared-ink-faint)]" aria-hidden="true" />
              ) : (
                <File className="h-3 w-3 shrink-0 text-[var(--boared-ink-faint)]" aria-hidden="true" />
              )}
              <span className="truncate">{child.name}</span>
            </button>
            {child.isDirectory && isOpen && (
              <ul>
                <TreeRender
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  selectedId={selectedId}
                />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}

function FilePreview({ entry }: { entry: ProjectArchiveEntry }) {
  const isText = (entry.contentType ?? "").startsWith("text/");
  const { data, isLoading, error } = useQuery({
    queryKey: ["archive-file", entry.id, entry.path],
    queryFn: async () => {
      if (!entry.isDirectory && entry.sizeBytes > 0 && isText && entry.assetId) {
        const res = await fetch(`/api/assets/${entry.assetId}/content`, { credentials: "include" });
        if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
        return res.text();
      }
      return null;
    },
    enabled: isText && !!entry.assetId,
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-3 py-2 border-b border-[var(--boared-rule)] flex items-baseline justify-between">
        <span className="font-mono text-[0.62rem] truncate">{entry.path}</span>
        <span className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
          {entry.sizeBytes} B
        </span>
      </header>
      <div className="flex-1 overflow-auto">
        {isText ? (
          isLoading ? (
            <p className="p-3 font-mono text-[0.7rem] text-[var(--boared-ink-faint)]">Loading…</p>
          ) : error ? (
            <p className="p-3 font-mono text-[0.7rem] text-destructive">
              {error instanceof Error ? error.message : "Preview failed"}
            </p>
          ) : (
            <pre className="p-3 font-mono text-[0.7rem] whitespace-pre-wrap break-words">{data ?? ""}</pre>
          )
        ) : (
          <p className="p-3 font-serif italic text-[0.9rem] text-[var(--boared-ink-faint)]">
            Binary file — preview unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
