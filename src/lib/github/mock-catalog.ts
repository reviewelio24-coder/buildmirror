import {
  DEMO_USER_ID,
  MOCK_GITHUB_INSTALLATION_IDS,
  MOCK_GITHUB_REPOSITORY_IDS,
} from "@/lib/ids";
import type { MappedGitHubRepository } from "@/lib/github/types";
import type { GitHubInstallation } from "@/lib/types/domain";

const INSTALLED_AT = "2026-08-31T01:00:00.000Z";

function mappedRepo(input: {
  id: number;
  owner: string;
  name: string;
  isPrivate?: boolean;
  isArchived?: boolean;
  isDisabled?: boolean;
}): MappedGitHubRepository {
  return {
    githubRepositoryId: input.id,
    owner: input.owner,
    name: input.name,
    fullName: `${input.owner}/${input.name}`,
    defaultBranch: "main",
    htmlUrl: `https://github.com/${input.owner}/${input.name}`,
    isPrivate: input.isPrivate ?? false,
    isArchived: input.isArchived ?? false,
    isDisabled: input.isDisabled ?? false,
    permissions: { contents: "read", metadata: "read" },
    githubPushedAt: "2026-08-30T12:00:00.000Z",
  };
}

export function createDemoGitHubCatalog(userId = DEMO_USER_ID): {
  installations: GitHubInstallation[];
  catalogs: Record<string, MappedGitHubRepository[]>;
} {
  const userInstallation: GitHubInstallation = {
    id: MOCK_GITHUB_INSTALLATION_IDS.user,
    userId,
    githubExternalInstallationId: 9001,
    accountLogin: "demo-user",
    accountType: "User",
    accountId: 101,
    repositorySelection: "selected",
    permissions: { contents: "read", metadata: "read" },
    events: [],
    installedAt: INSTALLED_AT,
    suspendedAt: null,
    deletedAt: null,
    lastSyncedAt: INSTALLED_AT,
    createdAt: INSTALLED_AT,
    updatedAt: INSTALLED_AT,
  };
  const orgInstallation: GitHubInstallation = {
    id: MOCK_GITHUB_INSTALLATION_IDS.org,
    userId,
    githubExternalInstallationId: 9002,
    accountLogin: "demo-org",
    accountType: "Organization",
    accountId: 202,
    repositorySelection: "all",
    permissions: { contents: "read", metadata: "read" },
    events: [],
    installedAt: INSTALLED_AT,
    suspendedAt: null,
    deletedAt: null,
    lastSyncedAt: INSTALLED_AT,
    createdAt: INSTALLED_AT,
    updatedAt: INSTALLED_AT,
  };

  return {
    installations: [userInstallation, orgInstallation],
    catalogs: {
      [userInstallation.id]: [
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.notes,
          owner: "demo-user",
          name: "github-notes",
        }),
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.dashboard,
          owner: "demo-user",
          name: "github-dashboard",
        }),
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.archived,
          owner: "demo-user",
          name: "github-archived",
          isArchived: true,
        }),
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.disabled,
          owner: "demo-user",
          name: "github-disabled",
          isDisabled: true,
        }),
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.privateApi,
          owner: "demo-user",
          name: "github-private-api",
          isPrivate: true,
        }),
      ],
      [orgInstallation.id]: [
        mappedRepo({
          id: MOCK_GITHUB_REPOSITORY_IDS.orgService,
          owner: "demo-org",
          name: "github-org-service",
        }),
      ],
    },
  };
}
