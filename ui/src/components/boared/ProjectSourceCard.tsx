/**
 * ProjectSourceCard — renders a project's codebase source state.
 *
 * Three states:
 *   - none         : two tiles offering GitHub link / Archive upload
 *   - github       : connection + repo summary + unlink
 *   - local_archive: filename, size, ingested date + unlink
 *
 * Triggers the `ProjectSourceDialog` for state transitions.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Github, Upload, Link2Off, FolderArchive, ExternalLink } from "lucide-react";
import type { Project } from "@paperclipai/shared";
import { projectsApi } from "../../api/projects";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";
import { cn, relativeTime } from "../../lib/utils";
import { ProjectSourceDialog } from "./ProjectSourceDialog";

function humanBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function ProjectSourceCard({ project }: { project: Project }) {
  const [dialogMode, setDialogMode] = useState<"github" | "archive" | null>(null);
  const { pushToast } = useToast();
  const qc = useQueryClient();

  const unlink = useMutation({
    mutationFn: () => projectsApi.unlinkSource(project.id, project.companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.list(project.companyId) });
      pushToast({ tone: "info", title: "Source unlinked" });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Unlink failed",
      });
    },
  });

  const source = project.source;

  return (
    <>
      <section className="border border-[var(--boared-rule)] bg-[var(--boared-paper)]">
        <header className="flex items-baseline justify-between gap-2 px-3 py-2 border-b border-[var(--boared-rule)]">
          <h3 className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
            ✦ Codebase
          </h3>
          {source.kind !== "none" && (
            <button
              type="button"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
              className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] transition-colors inline-flex items-center gap-1 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            >
              <Link2Off className="h-3 w-3" aria-hidden="true" />
              {unlink.isPending ? "Unlinking…" : "Unlink"}
            </button>
          )}
        </header>

        {source.kind === "none" && (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--boared-rule)]">
            <SourceTile
              icon={Github}
              kicker="GitHub"
              title="Link a repo"
              description="Connect an existing repo to browse pull requests, commits, and review activity inline."
              onClick={() => setDialogMode("github")}
            />
            <SourceTile
              icon={Upload}
              kicker="Archive"
              title="Upload a zip"
              description="Upload a snapshot of the codebase. Files are indexed so agents and teammates can browse them here."
              onClick={() => setDialogMode("archive")}
            />
          </div>
        )}

        {source.kind === "github" && source.github && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-[var(--boared-ink)]">
              <Github className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-serif italic text-[1.1rem]">
                {source.github.owner}/{source.github.repo}
              </span>
              <a
                href={`https://github.com/${source.github.owner}/${source.github.repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)]"
                aria-label="Open on GitHub"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
            <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
              Default branch: {source.github.defaultBranch ?? "—"}
              {source.ingestedAt && <> · Linked {relativeTime(source.ingestedAt)}</>}
            </div>
          </div>
        )}

        {source.kind === "local_archive" && source.archive && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-[var(--boared-ink)]">
              <FolderArchive className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-serif italic text-[1.1rem] truncate">
                {source.archive.filename}
              </span>
            </div>
            <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
              {source.archive.entryCount} files · {humanBytes(source.archive.sizeBytes)}
              {source.ingestedAt && <> · Uploaded {relativeTime(source.ingestedAt)}</>}
            </div>
          </div>
        )}
      </section>

      <ProjectSourceDialog
        project={project}
        mode={dialogMode}
        onClose={() => setDialogMode(null)}
      />
    </>
  );
}

function SourceTile({
  icon: Icon,
  kicker,
  title,
  description,
  onClick,
}: {
  icon: typeof Github;
  kicker: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-4 hover:bg-[var(--boared-paper-2)]/60 transition-colors",
        "focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-[var(--boared-ink-faint)]" aria-hidden="true" />
        <span className="font-mono text-[0.52rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
          {kicker}
        </span>
      </div>
      <div className="font-serif italic text-[1.05rem] leading-snug mb-1 text-[var(--boared-ink)]">
        {title}
      </div>
      <p className="text-[0.82rem] leading-snug text-[var(--boared-ink-soft)]">
        {description}
      </p>
    </button>
  );
}
