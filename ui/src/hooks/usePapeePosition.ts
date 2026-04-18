import { useEffect, useRef } from "react";
import { useLocation, useParams } from "@/lib/router";
import { usePapeeOptional } from "../context/PapeeContext";

export interface PapeePageInfo {
  page: string;
  agentId?: string;
  issueId?: string;
  projectId?: string;
  workflowId?: string;
  runId?: string;
}

/** Infer current page + extract route params for context */
function inferPage(pathname: string, params: Record<string, string | undefined>): PapeePageInfo {
  const agentId = params.agentId;
  const issueId = params.issueId;
  const projectId = params.projectId;
  const workflowId = params.workflowId;
  const runId = params.runId;

  const base: PapeePageInfo = { page: "other", agentId, issueId, projectId, workflowId, runId };

  if (path.includes("/dashboard")) return { ...base, page: "dashboard" };

  if (runId && agentId) return { ...base, page: "agent-run" };
  if (agentId) return { ...base, page: "agent-detail" };

  if (issueId) return { ...base, page: "issue-detail" };

  if (runId && workflowId) return { ...base, page: "workflow-run" };
  if (workflowId) return { ...base, page: "workflow-detail" };

  if (projectId) return { ...base, page: "project-detail" };

  if (path.includes("/issues")) return { ...base, page: "issues" };
  if (path.includes("/agents")) return { ...base, page: "agents" };
  if (path.includes("/secrets")) return { ...base, page: "secrets" };
  if (path.includes("/projects")) return { ...base, page: "projects" };
  if (path.includes("/workflows")) return { ...base, page: "workflows" };
  if (path.includes("/costs")) return { ...base, page: "costs" };
  if (path.includes("/activity")) return { ...base, page: "activity" };
  if (path.includes("/org")) return { ...base, page: "org" };
  if (path.includes("/inbox")) return { ...base, page: "inbox" };
  return base;
}

/**
 * Triggers Papee's jumping animation on route changes.
 * Also exposes the current page context for contextual tips / chat.
 */
export function usePapeeNavigation(): PapeePageInfo {
  const location = useLocation();
  const params = useParams();
  const papee = usePapeeOptional();
  const prevPathRef = useRef(location.pathname);
  const pageInfo = inferPage(location.pathname, params);

  useEffect(() => {
    if (!papee) return;
    const prev = prevPathRef.current;
    prevPathRef.current = location.pathname;

    if (prev === location.pathname) return;

    if (papee.animState === "idle" || papee.animState === "idle-blink" || papee.animState === "idle-look-around") {
      papee.queueReaction("jumping", 600);
    }
  }, [location.pathname, papee]);

  return pageInfo;
}
