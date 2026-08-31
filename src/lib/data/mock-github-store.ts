import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type {
  GitHubInstallClaim,
  GitHubInstallNonceRecord,
  GitHubStore,
} from "@/lib/data/github-store";
import { createDemoGitHubCatalog } from "@/lib/github/mock-catalog";
import type {
  MappedGitHubRepository,
  RecordGitHubRepositoryInput,
  UpsertGitHubInstallationInput,
} from "@/lib/github/types";
import type { GitHubInstallation, Repository } from "@/lib/types/domain";

function notFound(): never {
  throw new AppError({
    userMessage: "GitHub App 설치를 찾을 수 없습니다.",
    developerCause: "GitHub installation not found or not owned by current user",
    code: "GITHUB_INSTALLATION_NOT_FOUND",
    status: 404,
  });
}

function alreadyLinked(): never {
  throw new AppError({
    userMessage: "이 GitHub App 설치는 이미 다른 계정에 연결되어 있습니다.",
    developerCause: "github_external_installation_id is unique across users",
    code: "GITHUB_INSTALLATION_ALREADY_LINKED",
    status: 409,
  });
}

export type MemoryGitHubData = {
  installations: GitHubInstallation[];
  repositories: Repository[];
  installStates: GitHubInstallNonceRecord[];
  installClaims: GitHubInstallClaim[];
  catalogs: Record<string, MappedGitHubRepository[]>;
};

export class MockGitHubStore implements GitHubStore {
  constructor(private readonly data: MemoryGitHubData) {}

  async listInstallations(userId: string): Promise<GitHubInstallation[]> {
    return this.data.installations.filter((item) => item.userId === userId);
  }

  async getInstallation(
    userId: string,
    installationId: string,
  ): Promise<GitHubInstallation> {
    const found = this.data.installations.find(
      (item) => item.id === installationId && item.userId === userId,
    );
    if (!found) {
      notFound();
    }
    return found;
  }

  async getInstallationByExternalId(
    userId: string,
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null> {
    return (
      this.data.installations.find(
        (item) =>
          item.userId === userId &&
          item.githubExternalInstallationId === githubExternalInstallationId,
      ) ?? null
    );
  }

  async upsertInstallation(
    userId: string,
    input: UpsertGitHubInstallationInput,
  ): Promise<GitHubInstallation> {
    const existing = this.data.installations.find(
      (item) =>
        item.githubExternalInstallationId === input.githubExternalInstallationId,
    );
    if (existing && existing.userId !== userId) {
      alreadyLinked();
    }
    const now = input.lastSyncedAt;
    if (existing) {
      existing.accountLogin = input.accountLogin;
      existing.accountType = input.accountType;
      existing.accountId = input.accountId;
      existing.repositorySelection = input.repositorySelection;
      existing.permissions = input.permissions;
      existing.events = input.events;
      existing.installedAt = input.installedAt;
      existing.suspendedAt = input.suspendedAt;
      existing.lastSyncedAt = now;
      existing.updatedAt = now;
      return existing;
    }
    const created: GitHubInstallation = {
      id: randomUUID(),
      userId,
      githubExternalInstallationId: input.githubExternalInstallationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      accountId: input.accountId,
      repositorySelection: input.repositorySelection,
      permissions: input.permissions,
      events: input.events,
      installedAt: input.installedAt,
      suspendedAt: input.suspendedAt,
      deletedAt: null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.data.installations.push(created);
    return created;
  }

  async createInstallNonce(
    userId: string,
    nonce: string,
    expiresAt: string,
  ): Promise<void> {
    this.data.installStates.push({
      nonce,
      userId,
      expiresAt,
      consumedAt: null,
    });
  }

  async consumeInstallNonce(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<"consumed" | "missing" | "expired" | "reused"> {
    const row = this.data.installStates.find(
      (item) => item.nonce === nonce && item.userId === userId,
    );
    if (!row) {
      return "missing";
    }
    if (row.consumedAt) {
      return "reused";
    }
    if (Date.parse(row.expiresAt) <= Date.parse(nowIso)) {
      return "expired";
    }
    row.consumedAt = nowIso;
    return "consumed";
  }

  async createInstallClaim(input: {
    userId: string;
    nonce: string;
    githubExternalInstallationId: number;
    returnTo: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void> {
    this.data.installClaims.push({
      nonce: input.nonce,
      userId: input.userId,
      githubExternalInstallationId: input.githubExternalInstallationId,
      returnTo: input.returnTo,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: input.createdAt,
    });
  }

  async getInstallClaim(
    userId: string,
    nonce: string,
  ): Promise<GitHubInstallClaim | null> {
    return (
      this.data.installClaims.find(
        (item) => item.nonce === nonce && item.userId === userId,
      ) ?? null
    );
  }

  async consumeInstallClaim(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<"consumed" | "missing" | "expired" | "reused"> {
    const row = this.data.installClaims.find(
      (item) => item.nonce === nonce && item.userId === userId,
    );
    if (!row) {
      return "missing";
    }
    if (row.consumedAt) {
      return "reused";
    }
    if (Date.parse(row.expiresAt) <= Date.parse(nowIso)) {
      return "expired";
    }
    row.consumedAt = nowIso;
    return "consumed";
  }

  async findOpenInstallClaim(
    userId: string,
    githubExternalInstallationId: number,
    nowIso: string,
  ): Promise<GitHubInstallClaim | null> {
    return (
      this.data.installClaims.find(
        (item) =>
          item.userId === userId &&
          item.githubExternalInstallationId === githubExternalInstallationId &&
          !item.consumedAt &&
          Date.parse(item.expiresAt) > Date.parse(nowIso),
      ) ?? null
    );
  }

  async listInstallationRepositories(
    userId: string,
    installationId: string,
  ): Promise<Repository[]> {
    await this.getInstallation(userId, installationId);
    return this.data.repositories.filter(
      (item) =>
        item.userId === userId && item.githubInstallationId === installationId,
    );
  }

  async recordRepository(
    userId: string,
    input: RecordGitHubRepositoryInput,
  ): Promise<Repository> {
    const installation = await this.getInstallation(userId, input.installationId);
    const now = new Date().toISOString();
    const existing = this.data.repositories.find(
      (item) =>
        item.userId === userId &&
        item.githubRepositoryId === input.githubRepositoryId,
    );
    if (existing) {
      existing.githubInstallationId = installation.id;
      existing.provider = "github";
      existing.providerId = String(input.githubRepositoryId);
      existing.owner = input.owner;
      existing.name = input.name;
      existing.fullName = input.fullName;
      existing.defaultBranch = input.defaultBranch;
      existing.htmlUrl = input.htmlUrl;
      existing.isPrivate = input.isPrivate;
      existing.isArchived = input.isArchived;
      existing.isDisabled = input.isDisabled;
      existing.permissions = input.permissions;
      existing.githubPushedAt = input.githubPushedAt;
      existing.lastSyncedAt = input.lastSyncedAt ?? now;
      existing.connectionStatus = "connected";
      if (input.headSha !== undefined) {
        existing.headSha = input.headSha;
      }
      existing.updatedAt = now;
      return existing;
    }
    const created: Repository = {
      id: randomUUID(),
      userId,
      provider: "github",
      providerId: String(input.githubRepositoryId),
      owner: input.owner,
      name: input.name,
      defaultBranch: input.defaultBranch,
      headSha: input.headSha ?? null,
      connectionStatus: "connected",
      githubInstallationId: installation.id,
      githubRepositoryId: input.githubRepositoryId,
      htmlUrl: input.htmlUrl,
      isPrivate: input.isPrivate,
      fullName: input.fullName,
      isArchived: input.isArchived,
      isDisabled: input.isDisabled,
      permissions: input.permissions,
      githubPushedAt: input.githubPushedAt,
      lastSyncedAt: input.lastSyncedAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    this.data.repositories.push(created);
    return created;
  }

  async markMissingRepositories(
    userId: string,
    installationId: string,
    visibleGithubRepositoryIds: number[],
    syncedAt: string,
  ): Promise<void> {
    await this.getInstallation(userId, installationId);
    const visible = new Set(visibleGithubRepositoryIds);
    for (const repository of this.data.repositories) {
      if (
        repository.userId !== userId ||
        repository.githubInstallationId !== installationId ||
        repository.githubRepositoryId === null
      ) {
        continue;
      }
      if (!visible.has(repository.githubRepositoryId)) {
        repository.connectionStatus = "inaccessible";
        repository.lastSyncedAt = syncedAt;
        repository.updatedAt = syncedAt;
      }
    }
  }

  async touchInstallationSync(
    userId: string,
    installationId: string,
    lastSyncedAt: string,
  ): Promise<void> {
    const installation = await this.getInstallation(userId, installationId);
    installation.lastSyncedAt = lastSyncedAt;
    installation.updatedAt = lastSyncedAt;
  }

  getCatalog(installationId: string): MappedGitHubRepository[] {
    return this.data.catalogs[installationId] ?? [];
  }

  setCatalog(
    installationId: string,
    repositories: MappedGitHubRepository[],
  ): void {
    this.data.catalogs[installationId] = repositories;
  }

  useSharedRepositories(repositories: Repository[]): void {
    for (const repository of this.data.repositories) {
      const exists = repositories.some((item) => item.id === repository.id);
      if (!exists) {
        repositories.push(repository);
      }
    }
    this.data.repositories = repositories;
  }

  memoryData(): MemoryGitHubData {
    return this.data;
  }
}

type GlobalGitHubStore = typeof globalThis & {
  __buildMirrorGitHubStore?: MockGitHubStore;
};

export function createMemoryGitHubStore(
  data?: Partial<MemoryGitHubData>,
): MockGitHubStore {
  return new MockGitHubStore({
    installations: [...(data?.installations ?? [])],
    repositories: [...(data?.repositories ?? [])],
    installStates: [...(data?.installStates ?? [])],
    installClaims: [...(data?.installClaims ?? [])],
    catalogs: { ...(data?.catalogs ?? {}) },
  });
}

export function getMockGitHubStore(): MockGitHubStore {
  const globalStore = globalThis as GlobalGitHubStore;
  if (!globalStore.__buildMirrorGitHubStore) {
    const demo = createDemoGitHubCatalog();
    globalStore.__buildMirrorGitHubStore = createMemoryGitHubStore({
      installations: demo.installations,
      catalogs: demo.catalogs,
    });
  }
  return globalStore.__buildMirrorGitHubStore;
}
