import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { typeLabel, typeIcon, defaultTypeIcon, ApprovalPayloadRenderer } from "../components/ApprovalPayload";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/boared/PageHeader";
import { SectionRule } from "@/components/boared/Kicker";
import { Clipping } from "@/components/boared/Clipping";
import { Wire, WireList } from "@/components/boared/Wire";
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import type { ApprovalComment } from "@paperclipai/shared";
import { MarkdownBody } from "../components/MarkdownBody";

export function ApprovalDetail() {
  const { approvalId } = useParams<{ approvalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);

  const { data: approval, isLoading } = useQuery({
    queryKey: queryKeys.approvals.detail(approvalId!),
    queryFn: () => approvalsApi.get(approvalId!),
    enabled: !!approvalId,
  });
  const resolvedCompanyId = approval?.companyId ?? selectedCompanyId;

  const { data: comments } = useQuery({
    queryKey: queryKeys.approvals.comments(approvalId!),
    queryFn: () => approvalsApi.listComments(approvalId!),
    enabled: !!approvalId,
  });

  const { data: linkedIssues } = useQuery({
    queryKey: queryKeys.approvals.issues(approvalId!),
    queryFn: () => approvalsApi.listIssues(approvalId!),
    enabled: !!approvalId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId ?? ""),
    queryFn: () => agentsApi.list(resolvedCompanyId ?? ""),
    enabled: !!resolvedCompanyId,
  });

  useEffect(() => {
    if (!approval?.companyId || approval.companyId === selectedCompanyId) return;
    setSelectedCompanyId(approval.companyId, { source: "route_sync" });
  }, [approval?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Approvals", href: "/approvals" },
      { label: approval?.id?.slice(0, 8) ?? approvalId ?? "Approval" },
    ]);
  }, [setBreadcrumbs, approval, approvalId]);

  const refresh = () => {
    if (!approvalId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.detail(approvalId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.comments(approvalId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.issues(approvalId) });
    if (approval?.companyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(approval.companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.list(approval.companyId, "pending"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(approval.companyId) });
    }
  };

  const approveMutation = useMutation({
    mutationFn: () => approvalsApi.approve(approvalId!),
    onSuccess: () => {
      setError(null);
      refresh();
      navigate(`/approvals/${approvalId}?resolved=approved`, { replace: true });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Approve failed"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => approvalsApi.reject(approvalId!),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Reject failed"),
  });

  const revisionMutation = useMutation({
    mutationFn: () => approvalsApi.requestRevision(approvalId!),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Revision request failed"),
  });

  const resubmitMutation = useMutation({
    mutationFn: () => approvalsApi.resubmit(approvalId!),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Resubmit failed"),
  });

  const addCommentMutation = useMutation({
    mutationFn: () => approvalsApi.addComment(approvalId!, commentBody.trim()),
    onSuccess: () => {
      setCommentBody("");
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Comment failed"),
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.remove(agentId),
    onSuccess: () => {
      setError(null);
      refresh();
      navigate("/approvals");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Delete failed"),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!approval) return <p className="font-mono text-[0.72rem] text-muted-foreground">Approval not found.</p>;

  const payload = approval.payload as Record<string, unknown>;
  const linkedAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
  const isActionable = approval.status === "pending" || approval.status === "revision_requested";
  const TypeIcon = typeIcon[approval.type] ?? defaultTypeIcon;
  const showApprovedBanner = searchParams.get("resolved") === "approved" && approval.status === "approved";
  const primaryLinkedIssue = linkedIssues?.[0] ?? null;
  const resolvedCta =
    primaryLinkedIssue
      ? {
          label:
            (linkedIssues?.length ?? 0) > 1
              ? "Review linked issues"
              : "Review linked issue",
          to: `/issues/${primaryLinkedIssue.identifier ?? primaryLinkedIssue.id}`,
        }
      : linkedAgentId
        ? {
            label: "Open hired agent",
            to: `/agents/${linkedAgentId}`,
          }
        : {
            label: "Back to approvals",
            to: "/approvals",
          };

  const titleLabel = typeLabel[approval.type] ?? approval.type.replace(/_/g, " ");

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={
          <>
            §11 · Approvals · {approval.id.slice(0, 8)}
          </>
        }
        title={
          <span className="inline-flex items-center gap-4">
            <TypeIcon className="h-10 w-10 text-foreground shrink-0" />
            <span>{titleLabel}</span>
          </span>
        }
        dateline={
          <span className="inline-flex items-center gap-3">
            <StatusBadge status={approval.status} />
            {approval.requestedByAgentId && (
              <>
                <span className="text-[var(--boared-rule)]">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span>Requested by</span>
                  <Identity
                    name={agentNameById.get(approval.requestedByAgentId) ?? approval.requestedByAgentId.slice(0, 8)}
                    size="sm"
                  />
                </span>
              </>
            )}
          </span>
        }
      />

      {showApprovedBanner && (
        <div className="mb-6 border border-foreground bg-[var(--boared-acid)] text-[var(--boared-acid-ink)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <div className="relative mt-0.5">
                <CheckCircle2 className="h-4 w-4" />
                <Sparkles className="h-3 w-3 absolute -right-2 -top-1 animate-pulse" />
              </div>
              <div>
                <p className="boared-label">Approval confirmed</p>
                <p className="text-[0.78rem] mt-1">
                  Requesting agent was notified to review this approval and linked issues.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-[var(--boared-acid-ink)] text-[var(--boared-acid-ink)] hover:bg-[var(--boared-acid-ink)] hover:text-[var(--boared-acid)]"
              onClick={() => navigate(resolvedCta.to)}
            >
              {resolvedCta.label}
            </Button>
          </div>
        </div>
      )}

      <Clipping
        kicker={<>Request payload</>}
        title={titleLabel}
      >
        <div className="space-y-3 text-[0.82rem]">
          <ApprovalPayloadRenderer type={approval.type} payload={payload} />
          <button
            type="button"
            className="flex items-center gap-1 font-mono text-[0.62rem] tracking-tight text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowRawPayload((v) => !v)}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showRawPayload ? "rotate-90" : ""}`} />
            See full request
          </button>
          {showRawPayload && (
            <pre className="font-mono text-[0.7rem] bg-[var(--boared-paper-2)] border border-[var(--boared-rule)] p-3 overflow-x-auto">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
          {approval.decisionNote && (
            <p className="font-mono text-[0.7rem] text-muted-foreground">
              Decision note: {approval.decisionNote}
            </p>
          )}
          {error && (
            <div className="px-3 py-2 border border-destructive text-destructive font-mono text-[0.7rem]">
              {error}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {isActionable && (
              <>
                <Button
                  size="sm"
                  variant="acid"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  Reject
                </Button>
              </>
            )}
            {approval.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => revisionMutation.mutate()}
                disabled={revisionMutation.isPending}
              >
                Request revision
              </Button>
            )}
            {approval.status === "revision_requested" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resubmitMutation.mutate()}
                disabled={resubmitMutation.isPending}
              >
                Mark resubmitted
              </Button>
            )}
            {approval.status === "rejected" && approval.type === "hire_agent" && linkedAgentId && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/40"
                onClick={() => {
                  if (!window.confirm("Delete this disapproved agent? This cannot be undone.")) return;
                  deleteAgentMutation.mutate(linkedAgentId);
                }}
                disabled={deleteAgentMutation.isPending}
              >
                Delete disapproved agent
              </Button>
            )}
          </div>
        </div>
      </Clipping>

      {linkedIssues && linkedIssues.length > 0 && (
        <>
          <SectionRule label="Linked issues" meta={`${linkedIssues.length} total`} />
          <WireList>
            {linkedIssues.map((issue) => (
              <Wire
                key={issue.id}
                href={`/issues/${issue.identifier ?? issue.id}`}
                leading={
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                }
                title={<span>{issue.title}</span>}
              />
            ))}
          </WireList>
          <p className="font-mono text-[0.62rem] text-muted-foreground mt-2">
            Linked issues remain open until the requesting agent follows up and closes them.
          </p>
        </>
      )}

      <SectionRule label="Comments" meta={`${comments?.length ?? 0} total`} />
      <div className="space-y-0 border-t border-[var(--boared-rule)]">
        {(comments ?? []).map((comment: ApprovalComment) => (
          <div key={comment.id} className="border-b border-[var(--boared-rule)] px-1 py-3">
            <div className="flex items-center justify-between mb-1.5">
              {comment.authorAgentId ? (
                <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
                  <Identity
                    name={agentNameById.get(comment.authorAgentId) ?? comment.authorAgentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
              ) : (
                <Identity name="Board" size="sm" />
              )}
              <span className="font-mono text-[0.62rem] text-muted-foreground">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
            <MarkdownBody className="text-[0.82rem]">{comment.body}</MarkdownBody>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => addCommentMutation.mutate()}
            disabled={!commentBody.trim() || addCommentMutation.isPending}
          >
            {addCommentMutation.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
