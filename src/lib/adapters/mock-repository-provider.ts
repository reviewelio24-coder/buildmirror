import { COMMIT_SHAS, PROJECT_IDS, REPOSITORY_IDS } from "@/lib/ids";
import type {
  RepositoryLookup,
  RepositoryMetadata,
  RepositoryProvider,
} from "@/lib/adapters/repository-provider";
import { AppError } from "@/lib/errors";

const MOCK_REPOS: Record<string, RepositoryMetadata> = {
  [REPOSITORY_IDS.a]: {
    providerId: "mock-repo-a",
    owner: "demo-user",
    name: "portfolio-blog",
    defaultBranch: "main",
    headSha: COMMIT_SHAS.a,
    connectionStatus: "connected",
  },
  [REPOSITORY_IDS.b]: {
    providerId: "mock-repo-b",
    owner: "demo-user",
    name: "team-dashboard",
    defaultBranch: "main",
    headSha: COMMIT_SHAS.bLatest,
    connectionStatus: "connected",
  },
  [REPOSITORY_IDS.c]: {
    providerId: "mock-repo-c",
    owner: "demo-user",
    name: "shop-mvp",
    defaultBranch: "main",
    headSha: COMMIT_SHAS.cFailed,
    connectionStatus: "connected",
  },
  [REPOSITORY_IDS.d]: {
    providerId: "mock-repo-d",
    owner: "demo-user",
    name: "learning-notes",
    defaultBranch: "main",
    headSha: COMMIT_SHAS.d,
    connectionStatus: "connected",
  },
  [REPOSITORY_IDS.e]: {
    providerId: "mock-repo-e",
    owner: "demo-user",
    name: "archived-landing",
    defaultBranch: "main",
    headSha: COMMIT_SHAS.e,
    connectionStatus: "connected",
  },
};

const STALE_PROJECT_IDS = new Set<string>();

export class MockRepositoryProvider implements RepositoryProvider {
  async listRepositories(): Promise<RepositoryMetadata[]> {
    return Object.values(MOCK_REPOS);
  }

  async getRepositoryMetadata(
    lookup: RepositoryLookup,
  ): Promise<RepositoryMetadata> {
    return this.resolve(lookup);
  }

  async getDefaultBranch(lookup: RepositoryLookup): Promise<string> {
    return (await this.resolve(lookup)).defaultBranch;
  }

  async getHeadSha(lookup: RepositoryLookup): Promise<string> {
    if (STALE_PROJECT_IDS.has(lookup.id)) {
      throw new AppError({
        userMessage: "GitHub 최신 상태를 확인하지 못했습니다.",
        developerCause: `Mock freshness check failed for repository ${lookup.id}`,
        code: "GITHUB_FRESHNESS_UNAVAILABLE",
        status: 503,
      });
    }
    return (await this.resolve(lookup)).headSha;
  }

  async getConnectionStatus(
    lookup: RepositoryLookup,
  ): Promise<"connected" | "disconnected"> {
    return (await this.resolve(lookup)).connectionStatus;
  }

  private async resolve(lookup: RepositoryLookup): Promise<RepositoryMetadata> {
    const known = MOCK_REPOS[lookup.id];
    if (known) {
      return known;
    }
    return {
      providerId: lookup.providerId,
      owner: lookup.owner,
      name: lookup.name,
      defaultBranch: lookup.defaultBranch,
      headSha: lookup.defaultBranch ? "0".repeat(40) : "0".repeat(40),
      connectionStatus: "connected",
    };
  }
}

export const MOCK_PROJECT_HEAD_SHAS: Record<string, string> = {
  [PROJECT_IDS.a]: COMMIT_SHAS.a,
  [PROJECT_IDS.b]: COMMIT_SHAS.bLatest,
  [PROJECT_IDS.c]: COMMIT_SHAS.cFailed,
  [PROJECT_IDS.d]: COMMIT_SHAS.d,
  [PROJECT_IDS.e]: COMMIT_SHAS.e,
};
