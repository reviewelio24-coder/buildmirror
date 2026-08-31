import type {
  AnalysisJob,
  AnalysisJobType,
  CreateProjectInput,
  Project,
  ProjectDashboard,
  ProjectStatus,
  ProjectSummary,
  ProjectViewState,
} from "@/lib/types/domain";

export type ListProjectsQuery = {
  query?: string;
  visibility?: "active" | "archived" | "all";
};

export type ViewStateInput = {
  route: string;
  snapshotId: string | null;
  filters: Record<string, string>;
};

export type FreshnessUpdate = {
  latestKnownCommitSha: string | null;
  latestKnownAt: string;
  status: ProjectStatus;
  repositoryHeadSha?: string | null;
};

export interface ProjectStore {
  listProjectSummaries(
    userId: string,
    query?: ListProjectsQuery,
  ): Promise<ProjectSummary[]>;
  getProject(userId: string, projectId: string): Promise<Project>;
  getDashboard(
    userId: string,
    projectId: string,
    snapshotId?: string | null,
  ): Promise<ProjectDashboard>;
  createProject(userId: string, input: CreateProjectInput): Promise<Project>;
  updateProjectName(
    userId: string,
    projectId: string,
    name: string,
  ): Promise<Project>;
  archiveProject(userId: string, projectId: string): Promise<Project>;
  reactivateProject(userId: string, projectId: string): Promise<Project>;
  deleteProject(userId: string, projectId: string): Promise<void>;
  markProjectOpened(userId: string, projectId: string): Promise<void>;
  saveViewState(
    userId: string,
    projectId: string,
    input: ViewStateInput,
  ): Promise<ProjectViewState>;
  getViewState(
    userId: string,
    projectId: string,
  ): Promise<ProjectViewState | null>;
  updateFreshness(
    userId: string,
    projectId: string,
    input: FreshnessUpdate,
  ): Promise<Project>;
  enqueueMockAnalysisJob(
    userId: string,
    projectId: string,
    type: AnalysisJobType,
  ): Promise<AnalysisJob>;
}
