import type {
  AnalysisJob,
  AnalysisSnapshot,
  GitHubInstallation,
  LearningTask,
  Notification,
  Project,
  ProjectViewState,
  Repository,
  ScoreSet,
} from "@/lib/types/domain";

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  status: Project["status"];
  active_repository_id: string | null;
  analysis_branch: string;
  stored_commit_sha: string | null;
  latest_known_commit_sha: string | null;
  latest_known_at: string | null;
  last_successful_snapshot_id: string | null;
  last_opened_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RepositoryRow = {
  id: string;
  user_id: string;
  provider: Repository["provider"];
  provider_id: string;
  owner: string;
  name: string;
  default_branch: string;
  head_sha: string | null;
  connection_status: Repository["connectionStatus"];
  github_installation_id: string | null;
  github_repository_id: number | null;
  html_url: string | null;
  is_private: boolean | null;
  full_name: string | null;
  is_archived: boolean | null;
  is_disabled: boolean | null;
  github_permissions: Record<string, string> | null;
  github_pushed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SnapshotRow = {
  id: string;
  project_id: string;
  repository_id: string;
  branch: string;
  commit_sha: string;
  analysis_engine_version: string;
  constitution_version: string;
  status: AnalysisSnapshot["status"];
  data_source: AnalysisSnapshot["dataSource"];
  summary: string | null;
  learning_tasks: LearningTask[] | null;
  completed_at: string | null;
  created_at: string;
};

export type JobRow = {
  id: string;
  project_id: string;
  snapshot_id: string | null;
  type: AnalysisJob["type"];
  stage: AnalysisJob["stage"];
  progress: number;
  status: AnalysisJob["status"];
  error_code: string | null;
  error_message: string | null;
  repository_id: string | null;
  trigger_type: AnalysisJob["triggerType"] | null;
  trigger_ref: string | null;
  trigger_sha: string | null;
  github_delivery_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ScoreRow = {
  id: string;
  project_id: string;
  snapshot_id: string;
  correctness_value: number | null;
  correctness_confidence: number | null;
  correctness_summary: string;
  nativeness_value: number | null;
  nativeness_confidence: number | null;
  nativeness_summary: string;
  ownership_value: number | null;
  ownership_confidence: number | null;
  ownership_summary: string;
  verdict: ScoreSet["verdict"];
  data_source: ScoreSet["dataSource"];
};

export type ViewStateRow = {
  user_id: string;
  project_id: string;
  route: string;
  snapshot_id: string | null;
  filters: Record<string, string> | null;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  project_id: string;
  type: string;
  status: Notification["status"];
  title: string;
  body: string;
  created_at: string;
};

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    activeRepositoryId: row.active_repository_id,
    analysisBranch: row.analysis_branch,
    storedCommitSha: row.stored_commit_sha,
    latestKnownCommitSha: row.latest_known_commit_sha,
    latestKnownAt: row.latest_known_at,
    lastSuccessfulSnapshotId: row.last_successful_snapshot_id,
    lastOpenedAt: row.last_opened_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerId: row.provider_id,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.default_branch,
    headSha: row.head_sha,
    connectionStatus: row.connection_status,
    githubInstallationId: row.github_installation_id ?? null,
    githubRepositoryId: row.github_repository_id ?? null,
    htmlUrl: row.html_url ?? null,
    isPrivate: row.is_private ?? null,
    fullName: row.full_name ?? null,
    isArchived: row.is_archived ?? false,
    isDisabled: row.is_disabled ?? false,
    permissions: row.github_permissions ?? {},
    githubPushedAt: row.github_pushed_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSnapshot(row: SnapshotRow): AnalysisSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    branch: row.branch,
    commitSha: row.commit_sha,
    analysisEngineVersion: row.analysis_engine_version,
    constitutionVersion: row.constitution_version,
    status: row.status,
    dataSource: row.data_source,
    summary: row.summary,
    learningTasks: row.learning_tasks ?? [],
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function mapJob(row: JobRow): AnalysisJob {
  return {
    id: row.id,
    projectId: row.project_id,
    snapshotId: row.snapshot_id,
    type: row.type,
    stage: row.stage,
    progress: row.progress,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    repositoryId: row.repository_id ?? null,
    triggerType: row.trigger_type ?? "manual",
    triggerRef: row.trigger_ref ?? null,
    triggerSha: row.trigger_sha ?? null,
    githubDeliveryId: row.github_delivery_id ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function mapScore(row: ScoreRow): ScoreSet {
  return {
    id: row.id,
    projectId: row.project_id,
    snapshotId: row.snapshot_id,
    correctness: {
      value: row.correctness_value,
      confidence: row.correctness_confidence,
      summary: row.correctness_summary,
    },
    nativeness: {
      value: row.nativeness_value,
      confidence: row.nativeness_confidence,
      summary: row.nativeness_summary,
    },
    ownership: {
      value: row.ownership_value,
      confidence: row.ownership_confidence,
      summary: row.ownership_summary,
    },
    verdict: row.verdict,
    dataSource: row.data_source,
  };
}

export function mapViewState(row: ViewStateRow): ProjectViewState {
  return {
    userId: row.user_id,
    projectId: row.project_id,
    route: row.route,
    snapshotId: row.snapshot_id,
    filters: row.filters ?? {},
    updatedAt: row.updated_at,
  };
}

export function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}

export type GitHubInstallationRow = {
  id: string;
  user_id: string;
  github_external_installation_id: number;
  account_login: string;
  account_type: GitHubInstallation["accountType"];
  account_id: number;
  repository_selection: GitHubInstallation["repositorySelection"];
  permissions: Record<string, string> | null;
  events: string[] | null;
  installed_at: string;
  suspended_at: string | null;
  deleted_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapGitHubInstallation(
  row: GitHubInstallationRow,
): GitHubInstallation {
  return {
    id: row.id,
    userId: row.user_id,
    githubExternalInstallationId: row.github_external_installation_id,
    accountLogin: row.account_login,
    accountType: row.account_type,
    accountId: row.account_id,
    repositorySelection: row.repository_selection,
    permissions: row.permissions ?? {},
    events: row.events ?? [],
    installedAt: row.installed_at,
    suspendedAt: row.suspended_at,
    deletedAt: row.deleted_at ?? null,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
