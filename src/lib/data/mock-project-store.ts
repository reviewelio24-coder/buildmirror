import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { createDemoStoreData, createEmptyStoreData, type StoreData } from "@/lib/mock/seed";
import { deriveProjectStatus } from "@/lib/projects/status";
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

const DATA_FILE = path.join(process.cwd(), ".data", "mock-store.json");

function cloneData(data: StoreData): StoreData {
  return structuredClone(data);
}

function notFound(): never {
  throw new AppError({
    userMessage: "프로젝트를 찾을 수 없습니다.",
    developerCause: "Project not found or not owned by current user",
    code: "PROJECT_NOT_FOUND",
    status: 404,
  });
}

export class MockProjectStore implements ProjectStore {
  constructor(
    private data: StoreData,
    private readonly persist?: (data: StoreData) => Promise<void>,
  ) {}

  private async save(): Promise<void> {
    if (this.persist) {
      await this.persist(this.data);
    }
  }

  private ownedProject(userId: string, projectId: string): Project {
    const project = this.data.projects.find(
      (item) => item.id === projectId && item.userId === userId,
    );
    if (!project) {
      notFound();
    }
    return project;
  }

  async listProjectSummaries(
    userId: string,
    query: ListProjectsQuery = {},
  ): Promise<ProjectSummary[]> {
    const visibility = query.visibility ?? "all";
    const keyword = query.query?.trim().toLowerCase() ?? "";
    return this.data.projects
      .filter((project) => project.userId === userId)
      .filter((project) => {
        if (visibility === "active") {
          return !project.archivedAt;
        }
        if (visibility === "archived") {
          return Boolean(project.archivedAt);
        }
        return true;
      })
      .filter((project) => {
        if (!keyword) {
          return true;
        }
        const repository = this.data.repositories.find(
          (item) => item.id === project.activeRepositoryId,
        );
        const haystack = [
          project.name,
          repository?.owner,
          repository?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((left, right) => {
        const leftTime = left.lastOpenedAt ?? left.updatedAt;
        const rightTime = right.lastOpenedAt ?? right.updatedAt;
        return rightTime.localeCompare(leftTime);
      })
      .map((project) => this.toSummary(project));
  }

  async getProject(userId: string, projectId: string): Promise<Project> {
    return this.ownedProject(userId, projectId);
  }

  async getDashboard(
    userId: string,
    projectId: string,
    snapshotId?: string | null,
  ): Promise<ProjectDashboard> {
    const project = this.ownedProject(userId, projectId);
    const repository =
      this.data.repositories.find(
        (item) => item.id === project.activeRepositoryId,
      ) ?? null;
    const projectSnapshots = this.data.snapshots
      .filter((item) => item.projectId === projectId)
      .sort((left, right) =>
        (right.completedAt ?? right.createdAt).localeCompare(
          left.completedAt ?? left.createdAt,
        ),
      );
    const lastSuccessfulSnapshot =
      projectSnapshots.find(
        (item) =>
          item.id === project.lastSuccessfulSnapshotId &&
          item.status === "completed",
      ) ??
      projectSnapshots.find((item) => item.status === "completed") ??
      null;
    const requested = snapshotId
      ? projectSnapshots.find((item) => item.id === snapshotId) ?? null
      : null;
    const displayedSnapshot = requested ?? lastSuccessfulSnapshot;
    const scores =
      this.data.scores.find(
        (item) =>
          item.projectId === projectId &&
          item.snapshotId === displayedSnapshot?.id,
      ) ?? null;
    const jobs = this.data.jobs
      .filter((item) => item.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const activeJob =
      jobs.find((item) => item.status === "queued" || item.status === "running") ??
      null;
    const latestFailedJob =
      jobs.find((item) => item.status === "failed") ?? null;
    const notifications = this.data.notifications
      .filter((item) => item.projectId === projectId && item.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5);
    const viewState =
      this.data.viewStates.find(
        (item) => item.projectId === projectId && item.userId === userId,
      ) ?? null;

    return {
      project,
      repository,
      displayedSnapshot,
      lastSuccessfulSnapshot,
      scores,
      recentSnapshots: projectSnapshots.slice(0, 6),
      recentJobs: jobs.slice(0, 6),
      activeJob,
      latestFailedJob,
      notifications,
      viewState,
    };
  }

  async createProject(
    userId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    const now = new Date().toISOString();
    const repositoryId = randomUUID();
    const projectId = randomUUID();
    this.data.repositories.push({
      id: repositoryId,
      userId,
      provider: "mock",
      providerId: `mock-${input.repositoryOwner}-${input.repositoryName}`,
      owner: input.repositoryOwner,
      name: input.repositoryName,
      defaultBranch: input.defaultBranch,
      headSha: null,
      connectionStatus: "disconnected",
      createdAt: now,
      updatedAt: now,
    });
    const project: Project = {
      id: projectId,
      userId,
      name: input.name,
      status: "disconnected",
      activeRepositoryId: repositoryId,
      analysisBranch: input.defaultBranch,
      storedCommitSha: null,
      latestKnownCommitSha: null,
      latestKnownAt: null,
      lastSuccessfulSnapshotId: null,
      lastOpenedAt: now,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.projects.push(project);
    this.data.projectRepositories.push({
      projectId,
      repositoryId,
      role: "primary",
      linkedAt: now,
      unlinkedAt: null,
    });
    await this.save();
    return project;
  }

  async updateProjectName(
    userId: string,
    projectId: string,
    name: string,
  ): Promise<Project> {
    const project = this.ownedProject(userId, projectId);
    project.name = name;
    project.updatedAt = new Date().toISOString();
    await this.save();
    return project;
  }

  async archiveProject(userId: string, projectId: string): Promise<Project> {
    const project = this.ownedProject(userId, projectId);
    const now = new Date().toISOString();
    project.archivedAt = now;
    project.status = "archived";
    project.updatedAt = now;
    await this.save();
    return project;
  }

  async reactivateProject(userId: string, projectId: string): Promise<Project> {
    const project = this.ownedProject(userId, projectId);
    const dashboard = await this.getDashboard(userId, projectId);
    const repository =
      this.data.repositories.find(
        (item) => item.id === project.activeRepositoryId,
      ) ?? null;
    project.archivedAt = null;
    project.status = deriveProjectStatus({
      archivedAt: null,
      connectionStatus: repository?.connectionStatus ?? "disconnected",
      hasActiveJob: Boolean(dashboard.activeJob),
      latestJobFailed: Boolean(
        dashboard.latestFailedJob &&
          (!dashboard.lastSuccessfulSnapshot ||
            dashboard.latestFailedJob.createdAt >
              (dashboard.lastSuccessfulSnapshot.completedAt ?? "")),
      ),
      freshnessCheckFailed: false,
      storedCommitSha: project.storedCommitSha,
      latestKnownCommitSha: project.latestKnownCommitSha,
    });
    project.updatedAt = new Date().toISOString();
    await this.save();
    return project;
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    this.ownedProject(userId, projectId);
    this.data.projects = this.data.projects.filter((item) => item.id !== projectId);
    const linked = this.data.projectRepositories.filter(
      (item) => item.projectId === projectId,
    );
    this.data.projectRepositories = this.data.projectRepositories.filter(
      (item) => item.projectId !== projectId,
    );
    const repositoryIds = new Set(linked.map((item) => item.repositoryId));
    this.data.repositories = this.data.repositories.filter((item) => {
      if (!repositoryIds.has(item.id)) {
        return true;
      }
      const stillUsed = this.data.projectRepositories.some(
        (link) => link.repositoryId === item.id,
      );
      return stillUsed;
    });
    this.data.snapshots = this.data.snapshots.filter(
      (item) => item.projectId !== projectId,
    );
    this.data.jobs = this.data.jobs.filter((item) => item.projectId !== projectId);
    this.data.scores = this.data.scores.filter(
      (item) => item.projectId !== projectId,
    );
    this.data.viewStates = this.data.viewStates.filter(
      (item) => item.projectId !== projectId,
    );
    this.data.notifications = this.data.notifications.filter(
      (item) => item.projectId !== projectId,
    );
    await this.save();
  }

  async markProjectOpened(userId: string, projectId: string): Promise<void> {
    const project = this.ownedProject(userId, projectId);
    project.lastOpenedAt = new Date().toISOString();
    project.updatedAt = project.lastOpenedAt;
    await this.save();
  }

  async saveViewState(
    userId: string,
    projectId: string,
    input: ViewStateInput,
  ): Promise<ProjectViewState> {
    this.ownedProject(userId, projectId);
    const now = new Date().toISOString();
    const current = this.data.viewStates.find(
      (item) => item.userId === userId && item.projectId === projectId,
    );
    if (current) {
      current.route = input.route;
      current.snapshotId = input.snapshotId;
      current.filters = input.filters;
      current.updatedAt = now;
      await this.save();
      return current;
    }
    const created: ProjectViewState = {
      userId,
      projectId,
      route: input.route,
      snapshotId: input.snapshotId,
      filters: input.filters,
      updatedAt: now,
    };
    this.data.viewStates.push(created);
    await this.save();
    return created;
  }

  async getViewState(
    userId: string,
    projectId: string,
  ): Promise<ProjectViewState | null> {
    this.ownedProject(userId, projectId);
    return (
      this.data.viewStates.find(
        (item) => item.userId === userId && item.projectId === projectId,
      ) ?? null
    );
  }

  async updateFreshness(
    userId: string,
    projectId: string,
    input: FreshnessUpdate,
  ): Promise<Project> {
    const project = this.ownedProject(userId, projectId);
    project.latestKnownCommitSha = input.latestKnownCommitSha;
    project.latestKnownAt = input.latestKnownAt;
    project.status = input.status;
    project.updatedAt = new Date().toISOString();
    if (input.repositoryHeadSha && project.activeRepositoryId) {
      const repository = this.data.repositories.find(
        (item) => item.id === project.activeRepositoryId,
      );
      if (repository) {
        repository.headSha = input.repositoryHeadSha;
        repository.updatedAt = project.updatedAt;
      }
    }
    await this.save();
    return project;
  }

  async enqueueMockAnalysisJob(
    userId: string,
    projectId: string,
    type: AnalysisJobType,
  ): Promise<AnalysisJob> {
    const project = this.ownedProject(userId, projectId);
    const now = new Date().toISOString();
    const job: AnalysisJob = {
      id: randomUUID(),
      projectId,
      snapshotId: project.lastSuccessfulSnapshotId,
      type,
      stage: "analyzing",
      progress: 28,
      status: "running",
      errorCode: "MOCK_WORKER",
      errorMessage:
        "이 작업은 mock입니다. 실제 분석 워커는 연결되어 있지 않습니다.",
      createdAt: now,
      startedAt: now,
      completedAt: null,
    };
    this.data.jobs.unshift(job);
    project.status = "analyzing";
    project.updatedAt = now;
    this.data.notifications.unshift({
      id: randomUUID(),
      userId,
      projectId,
      type: "analysis_running",
      status: "unread",
      title: "mock 분석을 시작했습니다",
      body: "실제 코드 분석은 실행되지 않습니다. 다른 프로젝트로 이동할 수 있습니다.",
      createdAt: now,
    });
    await this.save();
    return job;
  }

  private toSummary(project: Project): ProjectSummary {
    const repository =
      this.data.repositories.find(
        (item) => item.id === project.activeRepositoryId,
      ) ?? null;
    const activeJob =
      this.data.jobs.find(
        (item) =>
          item.projectId === project.id &&
          (item.status === "queued" || item.status === "running"),
      ) ?? null;
    return {
      project,
      repository,
      activeJob,
    };
  }
}

type GlobalMockStore = typeof globalThis & {
  __buildMirrorMockStore?: MockProjectStore;
};

async function loadPersistedData(): Promise<StoreData> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    if (!parsed.projects?.length) {
      return createDemoStoreData();
    }
    return parsed;
  } catch {
    return createDemoStoreData();
  }
}

async function persistData(data: StoreData): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getMockProjectStore(): Promise<MockProjectStore> {
  const globalStore = globalThis as GlobalMockStore;
  if (!globalStore.__buildMirrorMockStore) {
    const data = cloneData(await loadPersistedData());
    globalStore.__buildMirrorMockStore = new MockProjectStore(data, persistData);
  }
  return globalStore.__buildMirrorMockStore;
}

export function createMemoryProjectStore(data?: StoreData): MockProjectStore {
  return new MockProjectStore(cloneData(data ?? createEmptyStoreData()));
}
