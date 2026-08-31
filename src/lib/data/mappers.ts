import type {
  AnalysisJob,
  AnalysisSnapshot,
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
