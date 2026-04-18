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
