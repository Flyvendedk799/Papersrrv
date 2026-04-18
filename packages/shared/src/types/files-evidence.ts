/**
 * Shared evidence + checklist types (backlog 2.0 B3 / B4, 1.5 B2 / B3).
 */

export interface IssueEvidenceSet {
  id: string;
  companyId: string;
  issueId: string;
  name: string;
  description: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface IssueEvidenceSetItem {
  id: string;
  setId: string;
  snapshotId: string;
  filePath: string;
  contentHash: string | null;
  note: string | null;
  createdAt: string;
}

export interface IssueEvidenceSetDetail extends IssueEvidenceSet {
  items: IssueEvidenceSetItem[];
}

export interface CommentFileEvidence {
  id: string;
  companyId: string;
  issueId: string;
  commentId: string;
  filePath: string;
  contentHash: string | null;
  snapshotId: string | null;
  excerpt: string | null;
  createdAt: string;
}

export type HandoffEnforcement = "advisory" | "required";

export interface HandoffChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
  checkedByUserId?: string | null;
}

export interface HandoffChecklist {
  id: string;
  companyId: string;
  issueId: string;
  enforcement: HandoffEnforcement;
  items: HandoffChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Relevance-ranked file row returned by the issue file relevance panel
 * (backlog 2.0 B1 / 1.5 A1).
 */
export interface IssueRelevantFile {
  filePath: string;
  contentHash: string | null;
  snapshotId: string;
  operation: string;
  agentId: string | null;
  agentName: string | null;
  runId: string | null;
  capturedAt: string;
  score: number;
  signals: {
    recency: number;
    editOperation: boolean;
    summaryLinked: boolean;
    mentions: number;
  };
}

/**
 * Top-level file navigation scope for the Files panel left rail.
 * Added as part of the post-recovery reconstruction; refine shapes as
 * the files feature is re-exercised.
 */
export type FileScope =
  | "hot"
  | "recent"
  | "mine"
  | "unread"
  | "all"
  | "review"
  | "locks"
  | "general";

/**
 * Reason a reviewer wants a file looked at; used as the key in a
 * Record<ReviewQueueItem["reason"], string> label map.
 */
export type ReviewQueueReason =
  | "summary"
  | "evidence"
  | "checklist";

export interface ReviewQueueItem {
  id: string;
  filePath: string;
  reason: ReviewQueueReason;
  queuedAt: string;
  issueId: string;
  issueKey?: string | null;
  issueTitle?: string | null;
  issueIdentifier?: string | null;
  waitingSince?: string | null;
  runId?: string | null;
  note?: string | null;
}

export interface HotFile {
  filePath: string;
  score: number;
  reasonLabel?: string;
  lastEditedAt?: string | null;
  lastEditorAgentId?: string | null;
  lastEditorAgentName?: string | null;
  editCount?: number;
  contentHash?: string | null;
  /** UX-layer enrichments used by the Boared Files Overview hero card. */
  projectColor?: string | null;
  projectName?: string | null;
  sparkline?: number[];
  churn?: number;
  agents?: Array<{
    agentId: string;
    agentName?: string | null;
    status?: string | null;
    lastSeenAt?: string | null;
  }>;
  lastCapturedAt?: string | null;
}
