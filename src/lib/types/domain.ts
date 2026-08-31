export const PROJECT_STATUSES = [
  "up_to_date",
  "changes_detected",
  "analyzing",
  "stale",
  "failed",
  "disconnected",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ANALYSIS_SNAPSHOT_STATUSES = [
  "completed",
  "failed",
  "partial",
] as const;

export type AnalysisSnapshotStatus = (typeof ANALYSIS_SNAPSHOT_STATUSES)[number];

export const ANALYSIS_JOB_TYPES = ["full", "incremental"] as const;
export type AnalysisJobType = (typeof ANALYSIS_JOB_TYPES)[number];

export const ANALYSIS_JOB_STAGES = [
  "queued",
  "cloning",
  "installing",
  "analyzing",
  "building",
  "generating_report",
  "completed",
  "failed",
] as const;

export type AnalysisJobStage = (typeof ANALYSIS_JOB_STAGES)[number];

export const ANALYSIS_JOB_STATUSES = [
  "pending",
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export type AnalysisJobStatus = (typeof ANALYSIS_JOB_STATUSES)[number];

export const REPOSITORY_PROVIDERS = ["mock", "github"] as const;
export type RepositoryProviderName = (typeof REPOSITORY_PROVIDERS)[number];

export const REPOSITORY_CONNECTION_STATUSES = [
  "connected",
  "disconnected",
  "inaccessible",
] as const;
export type RepositoryConnectionStatus =
  (typeof REPOSITORY_CONNECTION_STATUSES)[number];

export const PROJECT_REPOSITORY_ROLES = ["primary"] as const;
export type ProjectRepositoryRole = (typeof PROJECT_REPOSITORY_ROLES)[number];

export const NOTIFICATION_STATUSES = ["unread", "read"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const DATA_SOURCES = ["mock", "estimated", "confirmed"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const OVERALL_VERDICTS = [
  "ship_ready",
  "ship_with_caution",
  "learning_project",
  "not_ready",
  "insufficient_evidence",
] as const;
export type OverallVerdict = (typeof OVERALL_VERDICTS)[number];

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export type Profile = {
  id: string;
  displayName: string;
  skillLevel: string | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  activeRepositoryId: string | null;
  analysisBranch: string;
  storedCommitSha: string | null;
  latestKnownCommitSha: string | null;
  latestKnownAt: string | null;
  lastSuccessfulSnapshotId: string | null;
  lastOpenedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GitHubAccountType = "User" | "Organization";

export type GitHubInstallation = {
  id: string;
  userId: string;
  githubExternalInstallationId: number;
  accountLogin: string;
  accountType: GitHubAccountType;
  accountId: number;
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  events: string[];
  installedAt: string;
  suspendedAt: string | null;
  deletedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Repository = {
  id: string;
  userId: string;
  provider: RepositoryProviderName;
  providerId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  headSha: string | null;
  connectionStatus: RepositoryConnectionStatus;
  githubInstallationId: string | null;
  githubRepositoryId: number | null;
  htmlUrl: string | null;
  isPrivate: boolean | null;
  fullName: string | null;
  isArchived: boolean;
  isDisabled: boolean;
  permissions: Record<string, string>;
  githubPushedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRepository = {
  projectId: string;
  repositoryId: string;
  role: ProjectRepositoryRole;
  linkedAt: string;
  unlinkedAt: string | null;
};

export type LearningTask = {
  id: string;
  title: string;
  concept: string;
  reason: string;
  status: "suggested" | "pending";
};

export type AnalysisSnapshot = {
  id: string;
  projectId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  analysisEngineVersion: string;
  constitutionVersion: string;
  status: AnalysisSnapshotStatus;
  dataSource: DataSource;
  summary: string | null;
  learningTasks: LearningTask[];
  completedAt: string | null;
  createdAt: string;
};

export type AnalysisJobTriggerType = "manual" | "github_push" | "mock";

export type AnalysisJob = {
  id: string;
  projectId: string;
  snapshotId: string | null;
  repositoryId: string | null;
  type: AnalysisJobType;
  stage: AnalysisJobStage;
  progress: number;
  status: AnalysisJobStatus;
  errorCode: string | null;
  errorMessage: string | null;
  triggerType: AnalysisJobTriggerType;
  triggerRef: string | null;
  triggerSha: string | null;
  githubDeliveryId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type AxisScore = {
  value: number | null;
  confidence: number | null;
  summary: string;
};

export type ScoreSet = {
  id: string;
  projectId: string;
  snapshotId: string;
  correctness: AxisScore;
  nativeness: AxisScore;
  ownership: AxisScore;
  verdict: OverallVerdict | null;
  dataSource: DataSource;
};

export type ProjectViewState = {
  userId: string;
  projectId: string;
  route: string;
  snapshotId: string | null;
  filters: Record<string, string>;
  updatedAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  projectId: string;
  type: string;
  status: NotificationStatus;
  title: string;
  body: string;
  createdAt: string;
};

export type ProjectSummary = {
  project: Project;
  repository: Repository | null;
  activeJob: AnalysisJob | null;
};

export type ProjectDashboard = {
  project: Project;
  repository: Repository | null;
  displayedSnapshot: AnalysisSnapshot | null;
  lastSuccessfulSnapshot: AnalysisSnapshot | null;
  scores: ScoreSet | null;
  recentSnapshots: AnalysisSnapshot[];
  recentJobs: AnalysisJob[];
  activeJob: AnalysisJob | null;
  latestFailedJob: AnalysisJob | null;
  notifications: Notification[];
  viewState: ProjectViewState | null;
  invalidSnapshotRequested: boolean;
};

export const WEBHOOK_DELIVERY_STATUSES = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type GitHubWebhookDelivery = {
  githubDeliveryId: string;
  githubEvent: string;
  action: string | null;
  githubExternalInstallationId: number | null;
  githubRepositoryId: number | null;
  processingStatus: WebhookDeliveryStatus;
  errorCode: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export type CreateProjectInput = {
  name: string;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string;
};

export type SnapshotIdentity = {
  projectId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  analysisEngineVersion: string;
  constitutionVersion: string;
};
