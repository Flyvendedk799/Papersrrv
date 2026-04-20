/**
 * ProjectSourceDialog — modal for linking a codebase to a project.
 *
 * Two modes:
 *   - github  : pick connection + owner/repo, server verifies and saves
 *   - archive : drag/drop a .zip; uploaded, unpacked and indexed server-side
 *
 * Both modes invalidate the project detail cache on success so the
 * ProjectSourceCard re-renders to the linked state.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Upload, X, Loader2 } from "lucide-react";
import type { GithubConnection, Project } from "@paperclipai/shared";
import { githubApi } from "../../api/github";
import { projectsApi } from "../../api/projects";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";

interface Props {
  project: Project;
  mode: "github" | "archive" | null;
  onClose: () => void;
}

export function ProjectSourceDialog({ project, mode, onClose }: Props) {
  if (!mode) return null;
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--boared-paper)] border border-[var(--boared-rule)] w-full max-w-lg shadow-xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--boared-rule)]">
          <h2 className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            Link codebase
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="p-4">
          {mode === "github" ? (
            <GithubForm project={project} onSuccess={onClose} />
          ) : (
            <ArchiveForm project={project} onSuccess={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function GithubForm({ project, onSuccess }: { project: Project; onSuccess: () => void }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [connectionId, setConnectionId] = useState<string>("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");

  const { data: connections, isLoading } = useQuery({
    queryKey: ["github", "connections", project.companyId],
    queryFn: () => githubApi.listConnections(project.companyId),
  });

  const active = (connections ?? []).filter((c) => !c.revokedAt);
  const selectedConnection = active.find((c) => c.id === connectionId) ?? active[0];

  const link = useMutation({
    mutationFn: () => {
      if (!selectedConnection) throw new Error("Pick a GitHub connection");
      const trimmedOwner = owner.trim();
      const trimmedRepo = repo.trim();
      if (!trimmedOwner || !trimmedRepo) throw new Error("Owner and repo are required");
      return projectsApi.linkGithubSource(
        project.id,
        { connectionId: selectedConnection.id, owner: trimmedOwner, repo: trimmedRepo },
        project.companyId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.list(project.companyId) });
      pushToast({ tone: "info", title: "Repo linked" });
      onSuccess();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Link failed",
      });
    },
  });

  if (isLoading) {
    return (
      <p className="font-mono text-[0.7rem] text-[var(--boared-ink-faint)]">
        Loading connections…
      </p>
    );
  }

  if (active.length === 0) {
    return (
      <div className="space-y-3">
        <p className="font-serif italic text-[0.95rem] text-[var(--boared-ink)]">
          No GitHub connections yet.
        </p>
        <p className="text-[0.82rem] text-[var(--boared-ink-soft)]">
          Add a connection under <span className="font-mono">Settings → Integrations</span> first, then return here to link a repo.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        link.mutate();
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
          Connection
        </span>
        <select
          value={selectedConnection?.id ?? ""}
          onChange={(e) => setConnectionId(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          {active.map((c: GithubConnection) => (
            <option key={c.id} value={c.id}>
              {c.accountLogin ?? c.id.slice(0, 8)} · {c.authType}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
            Owner
          </span>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="acme-co"
            required
            className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
            Repo
          </span>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="webapp"
            required
            className="w-full mt-1 px-2 py-1.5 bg-[var(--boared-paper)] border border-[var(--boared-rule)] text-[0.88rem] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={link.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/10 disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          {link.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Github className="h-3 w-3" aria-hidden="true" />
          )}
          Link repo
        </button>
      </div>
    </form>
  );
}

function ArchiveForm({ project, onSuccess }: { project: Project; onSuccess: () => void }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Pick a .zip file");
      return projectsApi.uploadArchive(project.id, file, project.companyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.list(project.companyId) });
      pushToast({ tone: "info", title: "Archive uploaded" });
      onSuccess();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Upload failed",
      });
    },
  });

  const handleFile = (next: File | null) => {
    if (!next) return;
    if (!/\.zip$/i.test(next.name)) {
      pushToast({ tone: "error", title: "Only .zip archives are supported" });
      return;
    }
    setFile(next);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    handleFile(dropped ?? null);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "border border-dashed p-8 text-center transition-colors cursor-pointer",
          dragging
            ? "border-[var(--boared-acid)] bg-[var(--boared-acid)]/5"
            : "border-[var(--boared-rule)] hover:bg-[var(--boared-paper-2)]/40",
        )}
      >
        <Upload
          className="h-6 w-6 mx-auto mb-2 text-[var(--boared-ink-faint)]"
          aria-hidden="true"
        />
        {file ? (
          <div>
            <div className="font-serif italic text-[1rem] text-[var(--boared-ink)]">
              {file.name}
            </div>
            <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB · click to replace
            </div>
          </div>
        ) : (
          <div>
            <div className="font-serif italic text-[1rem] text-[var(--boared-ink)]">
              Drop a .zip here, or click to browse
            </div>
            <div className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] mt-1">
              Max 100 MB
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={onChange}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
          className="inline-flex items-center gap-2 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)]/10 disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          {upload.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-3 w-3" aria-hidden="true" />
          )}
          Upload
        </button>
      </div>
    </div>
  );
}
