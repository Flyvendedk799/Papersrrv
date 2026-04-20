export type { Company } from "./company.js";
export type {
  Agent,
  AgentPermissions,
  AgentKeyCreated,
  AgentConfigRevision,
  AdapterEnvironmentCheckLevel,
  AdapterEnvironmentTestStatus,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
} from "./agent.js";
export type { AssetImage } from "./asset.js";
export type { Project, ProjectGoalRef, ProjectWorkspace } from "./project.js";
export type {
  Issue,
  IssueAssigneeAdapterOverrides,
  IssueComment,
  IssueAncestor,
  IssueAncestorProject,
  IssueAncestorGoal,
  IssueAttachment,
  IssueLabel,
  IssueLinkApi,
  IssueWatcher,
  IssueSavedView,
  IssueTemplate,
} from "./issue.js";
export type { Goal } from "./goal.js";
export type { Approval, ApprovalComment } from "./approval.js";
export type {
  SecretProvider,
  SecretVersionSelector,
  EnvPlainBinding,
  EnvSecretRefBinding,
  EnvBinding,
  AgentEnvConfig,
  CompanySecret,
  SecretProviderDescriptor,
} from "./secrets.js";
export type { CostEvent, CostSummary, CostByAgent } from "./cost.js";
export type {
  HeartbeatRun,
  HeartbeatRunEvent,
  AgentRuntimeState,
  AgentTaskSession,
  AgentWakeupRequest,
} from "./heartbeat.js";
export type { LiveEvent } from "./live.js";
export type { DashboardSummary } from "./dashboard.js";
export type { ActivityEvent } from "./activity.js";
export type { SidebarBadges } from "./sidebar-badges.js";
export type {
  CompanyMembership,
  PrincipalPermissionGrant,
  Invite,
  JoinRequest,
  InstanceUserRoleGrant,
} from "./access.js";
export type { FileSnapshot, FileContent, FileTreeNode, FileWithHistory, IssueSummaryFile } from "./file.js";
export type {
  CompanyPortabilityInclude,
  CompanyPortabilitySecretRequirement,
  CompanyPortabilityCompanyManifestEntry,
  CompanyPortabilityAgentManifestEntry,
  CompanyPortabilityManifest,
  CompanyPortabilityExportResult,
  CompanyPortabilitySource,
  CompanyPortabilityImportTarget,
  CompanyPortabilityAgentSelection,
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewAgentPlan,
  CompanyPortabilityPreviewResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityExportRequest,
} from "./company-portability.js";
export type { CompanySkill } from "./skill.js";
export type {
  Workflow,
  WorkflowStep,
  WorkflowEdge,
  WorkflowRun,
  WorkflowStepRun,
  WorkflowTemplate,
  AgentRunStepConfig,
  ConditionStepConfig,
  ParallelGateStepConfig,
  ApprovalStepConfig,
  TransformStepConfig,
  WebhookStepConfig,
  SubWorkflowStepConfig,
  WorkflowDefinition,
  TriggerInput,
} from "./workflow.js";
export {
  BACKLOG_ITEM_STATUSES,
  BACKLOG_ITEM_SOURCES,
  BACKLOG_PLAN_KINDS,
  BACKLOG_PLAN_STATUSES,
} from "./backlog.js";
export type {
  BacklogItem,
  BacklogItemStatus,
  BacklogItemSource,
  BacklogItemSourceRef,
  BacklogPlan,
  BacklogPlanComment,
  BacklogPlanKind,
  BacklogPlanRevision,
  BacklogPlanStatus,
  PlanTemplate,
  PlanTemplateVariable,
  CreateBacklogItemInput,
  UpdateBacklogItemInput,
  CreateBacklogPlanInput,
  UpdateBacklogPlanInput,
  BacklogItemFilters,
} from "./backlog.js";

// ─── Papee companion action plumbing ──────────────────────────────
export { PAPEE_TOOL_TIER, papeeChatSchema } from "./papee.js";
export type {
  PapeeTool,
  PapeeToolKind,
  PapeeToolResult,
  PapeeRiskTier,
  PapeeAction,
  PapeeChatResponse,
  PapeeToolEntityRef,
} from "./papee.js";
export type {
  PapeeCompanionProfile,
  PapeeCompanionMode,
  PapeeInteractionEvent,
  PapeeInteractionResponse,
  PapeeLiveSignal,
  PapeeRitualId,
  PapeeRitualProgressResponse,
  PapeeRitualState,
  PapeeRitualTrack,
  PapeeMobileSnapshot,
} from "./papee-companion.js";

// ─── GitHub integration ───────────────────────────────────────────
export type {
  GithubConnection,
  GithubConnectionAuthType,
  GithubRepoView,
  GithubRepoCache,
  GithubPullRequestView,
  GithubPullRequestCache,
  GithubPullRequestState,
  GithubPullRequestListResult,
  GithubPullRequestDetailView,
  GithubPullRequestFileView,
  GithubCommitView,
  GithubBranchView,
  GithubReleaseView,
  GithubCheckRunView,
  GithubCheckStatus,
  GithubCheckConclusion,
  GithubReviewView,
  GithubWebhookEventType,
  GithubWebhookIngestResult,
  GithubRateLimitMeta,
  GithubApiError,
} from "./github.js";

// ─── Files + evidence ─────────────────────────────────────────────
export type {
  CommentFileEvidence,
  IssueRelevantFile,
  IssueEvidenceSet,
  IssueEvidenceSetDetail,
  IssueEvidenceSetItem,
  HandoffChecklistItem,
  HandoffChecklist,
  HandoffEnforcement,
  FileScope,
  ReviewQueueItem,
  ReviewQueueReason,
  HotFile,
} from "./files-evidence.js";
