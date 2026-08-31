import { AppError } from "@/lib/errors";
import type { GitHubStore } from "@/lib/data/github-store";
import {
  createInstallationAccessToken,
  fetchInstallationRepositories,
} from "@/lib/github/client";
import type { GitHubAppConfig } from "@/lib/github/config";
import type {
  GitHubInstallationAccessToken,
  MappedGitHubRepository,
  RecordGitHubRepositoryInput,
} from "@/lib/github/types";
import type { GitHubInstallation, Repository } from "@/lib/types/domain";

type FetchLike = typeof fetch;

export interface InstallationRepositorySource {
  list(installation: GitHubInstallation): Promise<MappedGitHubRepository[]>;
}

export class GitHubApiRepositorySource implements InstallationRepositorySource {
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly options: {
      fetchImpl?: FetchLike;
      now?: Date;
    } = {},
  ) {}

  async list(
    installation: GitHubInstallation,
  ): Promise<MappedGitHubRepository[]> {
    const token: GitHubInstallationAccessToken =
      await createInstallationAccessToken(
        this.config,
        installation.githubExternalInstallationId,
        {
          fetchImpl: this.options.fetchImpl,
          now: this.options.now,
        },
      );
    try {
      return await fetchInstallationRepositories(token, {
        fetchImpl: this.options.fetchImpl,
      });
    } finally {
      token.token = "";
    }
  }
}

export class StaticCatalogRepositorySource
  implements InstallationRepositorySource
{
  constructor(
    private readonly catalogs: Record<string, MappedGitHubRepository[]>,
  ) {}

  async list(
    installation: GitHubInstallation,
  ): Promise<MappedGitHubRepository[]> {
    return this.catalogs[installation.id] ?? [];
  }
}

export async function assertUsableInstallation(
  store: GitHubStore,
  userId: string,
  installationId: string,
): Promise<GitHubInstallation> {
  const installation = await store.getInstallation(userId, installationId);
  if (installation.suspendedAt) {
    throw new AppError({
      userMessage: "중단된 GitHub App 설치에서는 저장소를 조회할 수 없습니다.",
      developerCause: "installation is suspended",
      code: "GITHUB_INSTALLATION_SUSPENDED",
      status: 409,
    });
  }
  return installation;
}

export function toRecordGitHubRepositoryInput(
  installationId: string,
  mapped: MappedGitHubRepository,
  lastSyncedAt: string,
): RecordGitHubRepositoryInput {
  return {
    installationId,
    githubRepositoryId: mapped.githubRepositoryId,
    owner: mapped.owner,
    name: mapped.name,
    fullName: mapped.fullName,
    defaultBranch: mapped.defaultBranch,
    htmlUrl: mapped.htmlUrl,
    isPrivate: mapped.isPrivate,
    isArchived: mapped.isArchived,
    isDisabled: mapped.isDisabled,
    permissions: mapped.permissions,
    githubPushedAt: mapped.githubPushedAt,
    lastSyncedAt,
  };
}

export async function syncInstallationRepositories(input: {
  userId: string;
  installationId: string;
  store: GitHubStore;
  source: InstallationRepositorySource;
  now?: Date;
}): Promise<Repository[]> {
  const installation = await assertUsableInstallation(
    input.store,
    input.userId,
    input.installationId,
  );
  const nowIso = (input.now ?? new Date()).toISOString();
  const live = await input.source.list(installation);

  const visibleIds: number[] = [];
  for (const mapped of live) {
    visibleIds.push(mapped.githubRepositoryId);
    await input.store.recordRepository(
      input.userId,
      toRecordGitHubRepositoryInput(installation.id, mapped, nowIso),
    );
  }
  await input.store.markMissingRepositories(
    input.userId,
    installation.id,
    visibleIds,
    nowIso,
  );
  await input.store.touchInstallationSync(
    input.userId,
    installation.id,
    nowIso,
  );
  return input.store.listInstallationRepositories(
    input.userId,
    installation.id,
  );
}
