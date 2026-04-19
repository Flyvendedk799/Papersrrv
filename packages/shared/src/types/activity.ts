export interface ActivityEvent {
  id: string;
  companyId: string;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  runId: string | null;
  // Causal linkage for the Dossier DAG. Set when the activity was
  // emitted in response to a specific comment.
  triggeredByCommentId?: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}
