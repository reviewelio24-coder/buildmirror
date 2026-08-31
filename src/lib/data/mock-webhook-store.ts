import { randomUUID } from "node:crypto";
import type { MemoryGitHubData } from "@/lib/data/mock-github-store";
import type { StoreData } from "@/lib/mock/seed";
import type {
  ClaimDeliveryResult,
  GitHubPushJobInput,
  GitHubWebhookStore,
  WebhookRepositoryUpsert,
} from "@/lib/data/webhook-store";
import type {
  AnalysisJob,
  AnalysisSnapshot,
  GitHubInstallation,
  GitHubWebhookDelivery,
  Repository,
  WebhookDeliveryStatus,
} from "@/lib/types/domain";

const ZERO_SHA = /^0+$/;
const SHA_PATTERN = /^[0-9a-f]{40,64}$/i;

export class MockWebhookStore implements GitHubWebhookStore {
  constructor(
    private readonly github: MemoryGitHubData,
    private readonly projects: StoreData,
    private readonly deliveries: GitHubWebhookDelivery[],
  ) {}

  async claimDelivery(input: {
    deliveryId: string;
    event: string;
    action: string | null;
    githubExternalInstallationId: number | null;
    githubRepositoryId: number | null;
  }): Promise<ClaimDeliveryResult> {
    const existing = this.deliveries.find(
      (item) => item.githubDeliveryId === input.deliveryId,
    );
    if (!existing) {
      this.deliveries.push({
        githubDeliveryId: input.deliveryId,
        githubEvent: input.event,
        action: input.action,
        githubExternalInstallationId: input.githubExternalInstallationId,
        githubRepositoryId: input.githubRepositoryId,
        processingStatus: "received",
        errorCode: null,
        receivedAt: new Date().toISOString(),
        processedAt: null,
      });
      return { kind: "new", status: "received" };
    }
    if (existing.processingStatus === "failed" || existing.processingStatus === "received") {
      existing.processingStatus = "received";
      existing.errorCode = null;
      existing.processedAt = null;
      existing.action = input.action ?? existing.action;
      existing.githubExternalInstallationId =
        input.githubExternalInstallationId ??
        existing.githubExternalInstallationId;
      existing.githubRepositoryId =
        input.githubRepositoryId ?? existing.githubRepositoryId;
      return { kind: "retry", status: "received" };
    }
    return { kind: "duplicate", status: existing.processingStatus };
  }

  async finishDelivery(
    deliveryId: string,
    status: Exclude<WebhookDeliveryStatus, "received">,
    errorCode?: string | null,
  ): Promise<void> {
    const row = this.deliveries.find((item) => item.githubDeliveryId === deliveryId);
    if (!row) {
      return;
    }
    row.processingStatus = status;
    row.errorCode = errorCode ?? null;
    row.processedAt = new Date().toISOString();
  }

  async getDelivery(
    deliveryId: string,
  ): Promise<GitHubWebhookDelivery | null> {
    return (
      this.deliveries.find((item) => item.githubDeliveryId === deliveryId) ?? null
    );
  }

  async findInstallationByExternalId(
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null> {
    return (
      this.github.installations.find(
        (item) => item.githubExternalInstallationId === githubExternalInstallationId,
      ) ?? null
    );
  }

  async applyInstallationAction(
    githubExternalInstallationId: number,
    action: "deleted" | "suspend" | "unsuspend",
    at: string,
  ): Promise<boolean> {
    const installation = this.github.installations.find(
      (item) =>
        item.githubExternalInstallationId === githubExternalInstallationId &&
        !item.deletedAt,
    );
    if (!installation) {
      return false;
    }
    if (action === "deleted") {
      installation.deletedAt = at;
      installation.suspendedAt = installation.suspendedAt ?? at;
      installation.updatedAt = at;
      for (const repository of this.github.repositories) {
        if (repository.githubInstallationId === installation.id) {
          repository.connectionStatus = "inaccessible";
          repository.lastSyncedAt = at;
          repository.updatedAt = at;
        }
      }
      return true;
    }
    if (action === "suspend") {
      installation.suspendedAt = at;
      installation.updatedAt = at;
      return true;
    }
    installation.suspendedAt = null;
    installation.updatedAt = at;
    return true;
  }

  async markRepositoriesAccess(
    githubExternalInstallationId: number,
    githubRepositoryIds: number[],
    accessible: boolean,
    at: string,
  ): Promise<number> {
    const installation = await this.findInstallationByExternalId(
      githubExternalInstallationId,
    );
    if (!installation) {
      return 0;
    }
    const ids = new Set(githubRepositoryIds);
    let count = 0;
    for (const repository of this.github.repositories) {
      if (
        repository.githubInstallationId !== installation.id ||
        repository.githubRepositoryId === null ||
        !ids.has(repository.githubRepositoryId)
      ) {
        continue;
      }
      repository.connectionStatus = accessible ? "connected" : "inaccessible";
      repository.lastSyncedAt = at;
      repository.updatedAt = at;
      count += 1;
    }
    return count;
  }

  async upsertRepository(
    input: WebhookRepositoryUpsert,
    at: string,
  ): Promise<boolean> {
    const installation = this.github.installations.find(
      (item) =>
        item.githubExternalInstallationId === input.githubExternalInstallationId &&
        !item.deletedAt &&
        !item.suspendedAt,
    );
    if (!installation) {
      return false;
    }
    const existing = this.github.repositories.find(
      (item) =>
        item.userId === installation.userId &&
        item.githubRepositoryId === input.githubRepositoryId,
    );
    const isDisabled = input.isDisabled ?? existing?.isDisabled ?? false;
    if (existing) {
      existing.owner = input.owner || existing.owner;
      existing.name = input.name || existing.name;
      existing.fullName = input.fullName ?? existing.fullName;
      existing.htmlUrl = input.htmlUrl ?? existing.htmlUrl;
      existing.defaultBranch = input.defaultBranch || existing.defaultBranch;
      existing.isPrivate = input.isPrivate ?? existing.isPrivate;
      existing.isArchived = input.isArchived ?? existing.isArchived;
      existing.isDisabled = isDisabled;
      existing.githubInstallationId = installation.id;
      existing.connectionStatus = isDisabled ? "inaccessible" : "connected";
      existing.lastSyncedAt = at;
      existing.updatedAt = at;
      return true;
    }
    const owner = input.owner || "unknown";
    const name = input.name || "unknown";
    this.github.repositories.push({
      id: randomUUID(),
      userId: installation.userId,
      provider: "github",
      providerId: String(input.githubRepositoryId),
      owner,
      name,
      defaultBranch: input.defaultBranch || "main",
      headSha: null,
      connectionStatus: isDisabled ? "inaccessible" : "connected",
      githubInstallationId: installation.id,
      githubRepositoryId: input.githubRepositoryId,
      htmlUrl: input.htmlUrl ?? `https://github.com/${owner}/${name}`,
      isPrivate: input.isPrivate ?? false,
      fullName: input.fullName ?? `${owner}/${name}`,
      isArchived: input.isArchived ?? false,
      isDisabled,
      permissions: {},
      githubPushedAt: null,
      lastSyncedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    return true;
  }

  async enqueuePushJobs(input: GitHubPushJobInput): Promise<number> {
    if (!SHA_PATTERN.test(input.triggerSha) || ZERO_SHA.test(input.triggerSha)) {
      return 0;
    }
    const installation = this.github.installations.find(
      (item) =>
        item.githubExternalInstallationId === input.githubExternalInstallationId &&
        !item.deletedAt &&
        !item.suspendedAt,
    );
    if (!installation) {
      return 0;
    }
    const repository = this.github.repositories.find(
      (item) =>
        item.githubInstallationId === installation.id &&
        item.githubRepositoryId === input.githubRepositoryId &&
        item.connectionStatus === "connected" &&
        !item.isArchived &&
        !item.isDisabled,
    );
    if (!repository) {
      return 0;
    }
    if (input.triggerRef !== `refs/heads/${repository.defaultBranch}`) {
      return 0;
    }
    const projectIds = this.projects.projectRepositories
      .filter(
        (link) =>
          link.repositoryId === repository.id && link.unlinkedAt === null,
      )
      .map((link) => link.projectId);
    let created = 0;
    const now = new Date().toISOString();
    for (const projectId of projectIds) {
      const project = this.projects.projects.find(
        (item) =>
          item.id === projectId &&
          item.userId === repository.userId &&
          !item.archivedAt,
      );
      if (!project) {
        continue;
      }
      const duplicate = this.projects.jobs.some(
        (job) =>
          (job.githubDeliveryId === input.deliveryId &&
            job.projectId === projectId) ||
          (job.triggerType === "github_push" &&
            job.projectId === projectId &&
            job.repositoryId === repository.id &&
            job.triggerSha === input.triggerSha),
      );
      if (duplicate) {
        continue;
      }
      const job: AnalysisJob = {
        id: randomUUID(),
        projectId,
        snapshotId: null,
        repositoryId: repository.id,
        type: "incremental",
        stage: "queued",
        progress: 0,
        status: "pending",
        errorCode: null,
        errorMessage: null,
        triggerType: "github_push",
        triggerRef: input.triggerRef,
        triggerSha: input.triggerSha,
        githubDeliveryId: input.deliveryId,
        createdAt: now,
        startedAt: null,
        completedAt: null,
      };
      this.projects.jobs.unshift(job);
      created += 1;
    }
    return created;
  }

  async listJobs(): Promise<AnalysisJob[]> {
    return [...this.projects.jobs];
  }

  async listSnapshots(): Promise<AnalysisSnapshot[]> {
    return [...this.projects.snapshots];
  }

  async listRepositories(): Promise<Repository[]> {
    return [...this.github.repositories];
  }
}

export function createMemoryWebhookStore(input: {
  github: MemoryGitHubData;
  projects: StoreData;
  deliveries?: GitHubWebhookDelivery[];
}): MockWebhookStore {
  return new MockWebhookStore(
    input.github,
    input.projects,
    input.deliveries ?? [],
  );
}
