// Workflow definition
export interface Workflow {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  templateId: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Populated on detail queries
  steps?: WorkflowStep[];
  edges?: WorkflowEdge[];
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  companyId: string;
  name: string;
  description: string | null;
  stepOrder: number;
  stepType: string;
  agentId: string | null;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  inputMapping: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  companyId: string;
  sourceStepId: string;
  targetStepId: string;
  edgeType: string;
  label: string | null;
  createdAt: Date;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  companyId: string;
  status: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  context: Record<string, unknown>;
  issueId: string | null;
  parentRunId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Populated on detail queries
  stepRuns?: WorkflowStepRun[];
  workflow?: { name: string; description: string | null };
}

export interface WorkflowStepRun {
  id: string;
  workflowRunId: string;
  stepId: string;
  companyId: string;
  status: string;
  heartbeatRunId: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Populated on detail queries
  step?: WorkflowStep;
}

export interface WorkflowTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  category: string | null;
  stepsJson: Record<string, unknown>[];
  edgesJson: Record<string, unknown>[];
  isBuiltIn: boolean;
  usageCount: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Step config types for each step type
export interface AgentRunStepConfig {
  model?: string;
  promptTemplate?: string;
  timeoutSec?: number;
  retryPolicy?: { maxRetries: number; backoffSec: number };
  adapterOverrides?: Record<string, unknown>;
}

export interface ConditionStepConfig {
  expression?: string;
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "exists" | "not_exists";
  value: unknown;
}

export interface ParallelGateStepConfig {
  waitFor: "all" | "any";
}

export interface ApprovalStepConfig {
  message: string;
  showContext?: boolean;
}

export interface TransformStepConfig {
  mapping: Record<string, string>;
  template?: string;
}

export interface WebhookStepConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SubWorkflowStepConfig {
  workflowId: string;
  inputMapping?: Record<string, string>;
}

// Auto-generation types
export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: Array<{
    tempId: string;
    name: string;
    stepType: string;
    agentName: string;
    model?: string;
    promptTemplate?: string;
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    from: string;
    to: string;
    edgeType?: string;
  }>;
}
