export interface FileSnapshot {
  id: string;
  companyId: string;
  agentId: string;
  agentName?: string;
  runId: string;
  filePath: string;
  contentHash: string | null;
  operation: string;
  capturedAt: string;
}

export interface FileContent {
  hash: string;
  content: string;
  size: number;
  isMarkdown: boolean;
  createdAt: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  lastOperation?: string;
  lastAgent?: string;
  lastCapturedAt?: string;
}

export interface FileWithHistory {
  filePath: string;
  latestSnapshot: FileSnapshot;
  content: FileContent | null;
  snapshotCount: number;
}
