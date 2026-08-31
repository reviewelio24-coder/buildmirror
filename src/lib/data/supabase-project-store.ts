import { AppError } from "@/lib/errors";
import { deriveProjectStatus } from "@/lib/projects/status";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AnalysisJob,
  AnalysisJobType,
  CreateProjectInput,
  Project,
  ProjectDashboard,
  ProjectSummary,
  ProjectViewState,
} from "@/lib/types/domain";
import type {
  FreshnessUpdate,
  ListProjectsQuery,
  ProjectStore,
  ViewStateInput,
} from "@/lib/data/project-store";
import {
  mapJob,
  mapNotification,
  mapProject,
  mapRepository,
  mapScore,
  mapSnapshot,
  mapViewState,
  type JobRow,
  type NotificationRow,
  type ProjectRow,
  type RepositoryRow,
  type ScoreRow,
  type SnapshotRow,
  type ViewStateRow,
} from "@/lib/data/mappers";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function notFound(): never {
  throw new AppError({
    userMessage: "프로젝트를 찾을 수 없습니다.",
    developerCause: "Project not found or not owned by current user",
    code: "PROJECT_NOT_FOUND",
    status: 404,
  });
}

function fromSupabase(error: { message: string } | null, userMessage: string): never {
  throw new AppError({
    userMessage,
    developerCause: error?.message ?? "unknown supabase error",
    code: "SUPABASE_QUERY_FAILED",
    status: 500,
  });
}

export class SupabaseProjectStore implements ProjectStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async listProjectSummaries(
    userId: string,
    query: ListProjectsQuery = {},
  ): Promise<ProjectSummary[]> {
    let request = this.supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("last_opened_at", { ascending: false, nullsFirst: false });

    if (query.visibility === "active") {
      request = request.is("archived_at", null);
    } else if (query.visibility === "archived") {
      request = request.not("archived_at", "is", null);
    }

    const { data, error } = await request;
    if (error) {
      fromSupabase(error, "프로젝트 목록을 불러오지 못했습니다.");
    }

    const projects = ((data ?? []) as ProjectRow[]).map(mapProject);
    const keyword = query.query?.trim().toLowerCase() ?? "";
    const summaries: ProjectSummary[] = [];

    for (const project of projects) {
      const summary = await this.toSummary(project);
      if (keyword) {
        const haystack = [
          project.name,
          summary.repository?.owner,
          summary.repository?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          continue;
        }
      }
      summaries.push(summary);
    }
    return summaries;
  }

  async getProject(userId: string, projectId: string): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "프로젝트를 불러오지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    return mapProject(data as ProjectRow);
  }

  async getDashboard(
    userId: string,
    projectId: string,
    snapshotId?: string | null,
  ): Promise<ProjectDashboard> {
    const project = await this.getProject(userId, projectId);
    const repository = project.activeRepositoryId
      ? await this.getRepository(userId, project.activeRepositoryId)
      : null;

    const { data: snapshotRows, error: snapshotError } = await this.supabase
      .from("analysis_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .order("completed_at", { ascending: false, nullsFirst: false });
    if (snapshotError) {
      fromSupabase(snapshotError, "분석 스냅샷을 불러오지 못했습니다.");
    }
    const snapshots = ((snapshotRows ?? []) as SnapshotRow[]).map(mapSnapshot);
    const lastSuccessfulSnapshot =
      snapshots.find(
        (item) =>
          item.id === project.lastSuccessfulSnapshotId &&
          item.status === "completed",
      ) ??
      snapshots.find((item) => item.status === "completed") ??
      null;
    const requested = snapshotId
      ? snapshots.find((item) => item.id === snapshotId) ?? null
      : null;
    const displayedSnapshot = requested ?? lastSuccessfulSnapshot;

    let scores = null;
    if (displayedSnapshot) {
      const { data: scoreRow, error: scoreError } = await this.supabase
        .from("scores")
        .select("*")
        .eq("project_id", projectId)
        .eq("snapshot_id", displayedSnapshot.id)
        .maybeSingle();
      if (scoreError) {
        fromSupabase(scoreError, "점수를 불러오지 못했습니다.");
      }
      scores = scoreRow ? mapScore(scoreRow as ScoreRow) : null;
    }

    const { data: jobRows, error: jobError } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(6);
    if (jobError) {
      fromSupabase(jobError, "분석 작업을 불러오지 못했습니다.");
    }
    const jobs = ((jobRows ?? []) as JobRow[]).map(mapJob);
    const activeJob =
      jobs.find((item) => item.status === "queued" || item.status === "running") ??
      null;
    const latestFailedJob = jobs.find((item) => item.status === "failed") ?? null;

    const { data: notificationRows, error: notificationError } = await this.supabase
      .from("notifications")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (notificationError) {
      fromSupabase(notificationError, "알림을 불러오지 못했습니다.");
    }

    return {
      project,
      repository,
      displayedSnapshot,
      lastSuccessfulSnapshot,
      scores,
      recentSnapshots: snapshots.slice(0, 6),
      recentJobs: jobs,
      activeJob,
      latestFailedJob,
      notifications: ((notificationRows ?? []) as NotificationRow[]).map(
        mapNotification,
      ),
      viewState: await this.getViewState(userId, projectId),
    };
  }

  async createProject(
    userId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    const { data, error } = await this.supabase.rpc(
      "create_project_with_repository",
      {
        p_name: input.name,
        p_owner: input.repositoryOwner,
        p_repo_name: input.repositoryName,
        p_default_branch: input.defaultBranch,
      },
    );
    if (error || !data) {
      fromSupabase(error, "프로젝트를 만들지 못했습니다.");
    }
    return this.getProject(userId, data as string);
  }

  async updateProjectName(
    userId: string,
    projectId: string,
    name: string,
  ): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .update({ name })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) {
      fromSupabase(error, "프로젝트 이름을 바꾸지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    return mapProject(data as ProjectRow);
  }

  async archiveProject(userId: string, projectId: string): Promise<Project> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("projects")
      .update({ archived_at: now, status: "archived" })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) {
      fromSupabase(error, "프로젝트를 보관하지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    return mapProject(data as ProjectRow);
  }

  async reactivateProject(userId: string, projectId: string): Promise<Project> {
    const dashboard = await this.getDashboard(userId, projectId);
    const status = deriveProjectStatus({
      archivedAt: null,
      connectionStatus: dashboard.repository?.connectionStatus ?? "disconnected",
      hasActiveJob: Boolean(dashboard.activeJob),
      latestJobFailed: Boolean(
        dashboard.latestFailedJob &&
          (!dashboard.lastSuccessfulSnapshot ||
            dashboard.latestFailedJob.createdAt >
              (dashboard.lastSuccessfulSnapshot.completedAt ?? "")),
      ),
      freshnessCheckFailed: false,
      storedCommitSha: dashboard.project.storedCommitSha,
      latestKnownCommitSha: dashboard.project.latestKnownCommitSha,
    });
    const { data, error } = await this.supabase
      .from("projects")
      .update({ archived_at: null, status })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) {
      fromSupabase(error, "프로젝트를 다시 활성화하지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    return mapProject(data as ProjectRow);
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await this.getProject(userId, projectId);
    const { error } = await this.supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) {
      fromSupabase(error, "프로젝트를 삭제하지 못했습니다.");
    }
    if (project.activeRepositoryId) {
      await this.supabase
        .from("repositories")
        .delete()
        .eq("id", project.activeRepositoryId)
        .eq("user_id", userId);
    }
  }

  async markProjectOpened(userId: string, projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from("projects")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) {
      fromSupabase(error, "최근 사용 정보를 저장하지 못했습니다.");
    }
  }

  async saveViewState(
    userId: string,
    projectId: string,
    input: ViewStateInput,
  ): Promise<ProjectViewState> {
    await this.getProject(userId, projectId);
    const { data, error } = await this.supabase
      .from("project_view_state")
      .upsert({
        user_id: userId,
        project_id: projectId,
        route: input.route,
        snapshot_id: input.snapshotId,
        filters: input.filters,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) {
      fromSupabase(error, "화면 상태를 저장하지 못했습니다.");
    }
    return mapViewState(data as ViewStateRow);
  }

  async getViewState(
    userId: string,
    projectId: string,
  ): Promise<ProjectViewState | null> {
    const { data, error } = await this.supabase
      .from("project_view_state")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "화면 상태를 불러오지 못했습니다.");
    }
    return data ? mapViewState(data as ViewStateRow) : null;
  }

  async updateFreshness(
    userId: string,
    projectId: string,
    input: FreshnessUpdate,
  ): Promise<Project> {
    const project = await this.getProject(userId, projectId);
    const { data, error } = await this.supabase
      .from("projects")
      .update({
        latest_known_commit_sha: input.latestKnownCommitSha,
        latest_known_at: input.latestKnownAt,
        status: input.status,
      })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) {
      fromSupabase(error, "최신성 정보를 저장하지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    if (input.repositoryHeadSha && project.activeRepositoryId) {
      await this.supabase
        .from("repositories")
        .update({ head_sha: input.repositoryHeadSha })
        .eq("id", project.activeRepositoryId)
        .eq("user_id", userId);
    }
    return mapProject(data as ProjectRow);
  }

  async enqueueMockAnalysisJob(
    userId: string,
    projectId: string,
    type: AnalysisJobType,
  ): Promise<AnalysisJob> {
    const project = await this.getProject(userId, projectId);
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .insert({
        project_id: projectId,
        snapshot_id: project.lastSuccessfulSnapshotId,
        type,
        stage: "analyzing",
        progress: 28,
        status: "running",
        error_code: "MOCK_WORKER",
        error_message:
          "이 작업은 mock입니다. 실제 분석 워커는 연결되어 있지 않습니다.",
        started_at: now,
      })
      .select("*")
      .single();
    if (error || !data) {
      fromSupabase(error, "mock 분석 작업을 만들지 못했습니다.");
    }
    await this.supabase
      .from("projects")
      .update({ status: "analyzing" })
      .eq("id", projectId)
      .eq("user_id", userId);
    await this.supabase.from("notifications").insert({
      user_id: userId,
      project_id: projectId,
      type: "analysis_running",
      status: "unread",
      title: "mock 분석을 시작했습니다",
      body: "실제 코드 분석은 실행되지 않습니다. 다른 프로젝트로 이동할 수 있습니다.",
    });
    return mapJob(data as JobRow);
  }

  private async getRepository(
    userId: string,
    repositoryId: string,
  ) {
    const { data, error } = await this.supabase
      .from("repositories")
      .select("*")
      .eq("id", repositoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "저장소 정보를 불러오지 못했습니다.");
    }
    return data ? mapRepository(data as RepositoryRow) : null;
  }

  private async toSummary(project: Project): Promise<ProjectSummary> {
    const repository = project.activeRepositoryId
      ? await this.getRepository(project.userId, project.activeRepositoryId)
      : null;
    const { data: jobRows } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .eq("project_id", project.id)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1);
    const activeJob = jobRows?.[0] ? mapJob(jobRows[0] as JobRow) : null;
    return {
      project,
      repository,
      activeJob,
    };
  }
}
