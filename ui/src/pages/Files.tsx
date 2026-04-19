/**
 * Files — thin URL-state router over FilesShell.
 *
 * All three-zone layout, mode switching, tabs, and keyboard behaviour
 * live in `components/files/FilesShell`. This page only parses and
 * writes URL search params so links, refreshes, and back/forward all
 * land the user in the same state.
 *
 * Recognised params:
 *   mode=overview|reader     // default: overview
 *   scope=projects|agents|general|artifacts|hot|recent|mine|unread|all|review|locks
 *                            // default: projects
 *   project=<id>             // selected project in the left rail
 *   agent=<id>               // agent filter in the left rail
 *   file=<filePath>          // deep-linked file (seeds a reader tab)
 *   hash=<contentHash>       // optional version for deep-linked file
 */

import { useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { useSearchParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  FilesShell,
  type FilesMode,
} from "../components/files/FilesShell";
import type { LeftRailScope } from "../components/files/FilesLeftRail";
import { EmptyState } from "../components/EmptyState";

const VALID_MODES: ReadonlySet<FilesMode> = new Set(["overview", "reader"]);
const VALID_SCOPES: ReadonlySet<LeftRailScope> = new Set<LeftRailScope>([
  "projects",
  "agents",
  "general",
  "artifacts",
  "hot",
  "recent",
  "mine",
  "unread",
  "all",
  "review",
  "locks",
]);

export function Files() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    setBreadcrumbs([{ label: "Files" }]);
  }, [setBreadcrumbs]);

  const rawMode = searchParams.get("mode");
  const mode: FilesMode =
    rawMode && VALID_MODES.has(rawMode as FilesMode)
      ? (rawMode as FilesMode)
      : "overview";

  const rawScope = searchParams.get("scope");
  const scope: LeftRailScope =
    rawScope && VALID_SCOPES.has(rawScope as LeftRailScope)
      ? (rawScope as LeftRailScope)
      : "projects";

  const projectId = searchParams.get("project");
  const agentFilter = searchParams.get("agent");
  const filePath = searchParams.get("file");
  const contentHash = searchParams.get("hash");

  const initialFile = filePath
    ? { filePath, contentHash: contentHash ?? null }
    : null;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={FolderOpen}
        message="Pick a company from the sidebar to browse its files."
      />
    );
  }

  return (
    <FilesShell
      companyId={selectedCompanyId}
      mode={mode}
      onModeChange={(next) =>
        updateParam("mode", next === "overview" ? null : next)
      }
      scope={scope}
      onScopeChange={(next) =>
        updateParam("scope", next === "projects" ? null : next)
      }
      selectedProjectId={projectId}
      onSelectProject={(id) => updateParam("project", id)}
      agentFilter={agentFilter}
      onAgentFilter={(id) => updateParam("agent", id)}
      initialFile={initialFile}
    />
  );
}
