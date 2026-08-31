import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import type { GitHubAppConfig } from "@/lib/github/config";
import { createDemoGitHubCatalog } from "@/lib/github/mock-catalog";
import {
  GitHubApiRepositorySource,
  StaticCatalogRepositorySource,
  syncInstallationRepositories,
} from "@/lib/github/sync-repositories";
import { DEMO_USER_ID, MOCK_GITHUB_REPOSITORY_IDS } from "@/lib/ids";
import type {
  MappedGitHubRepository,
  UpsertGitHubInstallationInput,
} from "@/lib/github/types";

const USER_B = "00000000-0000-0000-0000-00000000000b";
const TOKEN = "ghs_secret_installation_token_value";

const installationInput: UpsertGitHubInstallationInput = {
  githubExternalInstallationId: 1001,
  accountLogin: "user-a",
  accountType: "User",
  accountId: 11,
  repositorySelection: "selected",
  permissions: { contents: "read" },
  events: ["push"],
  installedAt: "2026-08-31T01:00:00.000Z",
  suspendedAt: null,
  lastSyncedAt: "2026-08-31T01:05:00.000Z",
};

function mappedRepo(
  overrides: Partial<MappedGitHubRepository> &
    Pick<MappedGitHubRepository, "githubRepositoryId" | "name">,
): MappedGitHubRepository {
  const owner = overrides.owner ?? "user-a";
  const name = overrides.name;
  return {
    githubRepositoryId: overrides.githubRepositoryId,
    owner,
    name,
    fullName: overrides.fullName ?? `${owner}/${name}`,
    defaultBranch: overrides.defaultBranch ?? "main",
    htmlUrl: overrides.htmlUrl ?? `https://github.com/${owner}/${name}`,
    isPrivate: overrides.isPrivate ?? false,
    isArchived: overrides.isArchived ?? false,
    isDisabled: overrides.isDisabled ?? false,
    permissions: overrides.permissions ?? { contents: "read" },
    githubPushedAt: overrides.githubPushedAt ?? "2026-08-30T12:00:00.000Z",
  };
}

function testConfig(): GitHubAppConfig {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "123",
    clientId: "Iv1.example",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    slug: null,
  };
}

describe("syncInstallationRepositories", () => {
  it("upserts by GitHub numeric ID and keeps the same row after a rename", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    const first = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source: new StaticCatalogRepositorySource({
        [saved.id]: [mappedRepo({ githubRepositoryId: 7001, name: "old-name" })],
      }),
    });
    expect(first).toHaveLength(1);
    const originalId = first[0].id;
    const renamed = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source: new StaticCatalogRepositorySource({
        [saved.id]: [
          mappedRepo({
            githubRepositoryId: 7001,
            name: "new-name",
            defaultBranch: "develop",
          }),
        ],
      }),
    });
    expect(renamed).toHaveLength(1);
    expect(renamed[0].id).toBe(originalId);
    expect(renamed[0].name).toBe("new-name");
    expect(renamed[0].defaultBranch).toBe("develop");
    expect(renamed[0].githubRepositoryId).toBe(7001);
  });

  it("does not create a second row for the same numeric repository ID", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    const source = new StaticCatalogRepositorySource({
      [saved.id]: [
        mappedRepo({ githubRepositoryId: 7001, name: "alpha" }),
        mappedRepo({ githubRepositoryId: 7001, name: "alpha" }),
      ],
    });
    const synced = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source,
    });
    expect(synced).toHaveLength(1);
    expect(synced[0].githubRepositoryId).toBe(7001);
  });

  it("blocks another user from syncing someone else's installation", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    await expect(
      syncInstallationRepositories({
        userId: USER_B,
        installationId: saved.id,
        store,
        source: new StaticCatalogRepositorySource({ [saved.id]: [] }),
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_NOT_FOUND" });
  });

  it("keeps existing rows when the GitHub API fails", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source: new StaticCatalogRepositorySource({
        [saved.id]: [mappedRepo({ githubRepositoryId: 7001, name: "kept" })],
      }),
    });
    await expect(
      syncInstallationRepositories({
        userId: DEMO_USER_ID,
        installationId: saved.id,
        store,
        source: {
          list: async () => {
            throw new AppError({
              userMessage: "GitHub 저장소 목록을 불러오지 못했습니다.",
              developerCause: "GitHub repository list failed with status 500",
              code: "GITHUB_REPOSITORY_LIST_FAILED",
              status: 502,
            });
          },
        },
      }),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_LIST_FAILED" });
    const remaining = await store.listInstallationRepositories(
      DEMO_USER_ID,
      saved.id,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("kept");
    expect(remaining[0].connectionStatus).toBe("connected");
  });

  it("marks missing repositories inaccessible instead of deleting them", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source: new StaticCatalogRepositorySource({
        [saved.id]: [
          mappedRepo({ githubRepositoryId: 7001, name: "visible" }),
          mappedRepo({ githubRepositoryId: 7002, name: "removed" }),
        ],
      }),
    });
    const after = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source: new StaticCatalogRepositorySource({
        [saved.id]: [mappedRepo({ githubRepositoryId: 7001, name: "visible" })],
      }),
    });
    const removed = after.find((item) => item.githubRepositoryId === 7002);
    expect(removed?.connectionStatus).toBe("inaccessible");
    expect(after).toHaveLength(2);
  });

  it("does not persist the installation token on sync", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationInput);
    let page = 0;
    const source = new GitHubApiRepositorySource(testConfig(), {
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/app/installations/") && url.endsWith("/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: TOKEN,
              expires_at: "2026-08-31T02:00:00Z",
              permissions: { contents: "read" },
              repository_selection: "selected",
            }),
            { status: 200 },
          );
        }
        page += 1;
        const repo = {
          id: page,
          name: page === 1 ? "one" : "two",
          full_name: page === 1 ? "user-a/one" : "user-a/two",
          private: false,
          html_url:
            page === 1
              ? "https://github.com/user-a/one"
              : "https://github.com/user-a/two",
          default_branch: "main",
          owner: { login: "user-a" },
        };
        return new Response(JSON.stringify({ repositories: [repo] }), {
          status: 200,
          headers:
            page === 1
              ? {
                  Link: '<https://api.github.com/installation/repositories?page=2>; rel="next"',
                }
              : {},
        });
      },
    });
    const synced = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId: saved.id,
      store,
      source,
    });
    expect(synced).toHaveLength(2);
    expect(JSON.stringify(synced)).not.toContain(TOKEN);
    expect(JSON.stringify(await store.listInstallations(DEMO_USER_ID))).not.toContain(
      TOKEN,
    );
    expect(
      JSON.stringify(await store.listInstallationRepositories(DEMO_USER_ID, saved.id)),
    ).not.toContain(TOKEN);
  });

  it("seeds mock catalog repositories without dropping existing demo projects", async () => {
    const demo = createDemoGitHubCatalog();
    const store = createMemoryGitHubStore({
      installations: demo.installations,
      catalogs: demo.catalogs,
    });
    const installationId = demo.installations[0].id;
    const synced = await syncInstallationRepositories({
      userId: DEMO_USER_ID,
      installationId,
      store,
      source: new StaticCatalogRepositorySource(demo.catalogs),
    });
    expect(
      synced.some(
        (item) => item.githubRepositoryId === MOCK_GITHUB_REPOSITORY_IDS.privateApi,
      ),
    ).toBe(true);
    expect(
      synced.some(
        (item) => item.githubRepositoryId === MOCK_GITHUB_REPOSITORY_IDS.archived,
      ),
    ).toBe(true);
    expect(synced.find((item) => item.isPrivate)?.name).toBe("github-private-api");
  });
});
