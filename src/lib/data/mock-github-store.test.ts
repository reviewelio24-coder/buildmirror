import { describe, expect, it } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { DEMO_USER_ID } from "@/lib/ids";
import type { UpsertGitHubInstallationInput } from "@/lib/github/types";

const USER_B = "00000000-0000-0000-0000-00000000000b";

const installationA: UpsertGitHubInstallationInput = {
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

describe("mock GitHub installation isolation", () => {
  it("blocks the same GitHub installation from being claimed by another user", async () => {
    const store = createMemoryGitHubStore();
    await store.upsertInstallation(DEMO_USER_ID, installationA);
    await expect(
      store.upsertInstallation(USER_B, installationA),
    ).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_ALREADY_LINKED" });
    const owned = await store.listInstallations(DEMO_USER_ID);
    expect(owned).toHaveLength(1);
    expect(await store.listInstallations(USER_B)).toEqual([]);
  });

  it("does not let another user read or attach repositories to the installation", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationA);
    await expect(
      store.getInstallation(USER_B, saved.id),
    ).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_NOT_FOUND" });
    await expect(
      store.recordRepository(USER_B, {
        installationId: saved.id,
        githubRepositoryId: 555001,
        owner: "user-a",
        name: "secret",
        fullName: "user-a/secret",
        defaultBranch: "main",
        htmlUrl: "https://github.com/user-a/secret",
        isPrivate: true,
        isArchived: false,
        isDisabled: false,
        permissions: { contents: "read" },
        githubPushedAt: "2026-08-31T01:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_NOT_FOUND" });
    expect(await store.listInstallationRepositories(DEMO_USER_ID, saved.id)).toEqual(
      [],
    );
  });

  it("stores repository GitHub metadata without an access token", async () => {
    const store = createMemoryGitHubStore();
    const saved = await store.upsertInstallation(DEMO_USER_ID, installationA);
    const repo = await store.recordRepository(DEMO_USER_ID, {
      installationId: saved.id,
      githubRepositoryId: 555001,
      owner: "user-a",
      name: "portfolio-blog",
      fullName: "user-a/portfolio-blog",
      defaultBranch: "main",
      htmlUrl: "https://github.com/user-a/portfolio-blog",
      isPrivate: true,
      isArchived: false,
      isDisabled: false,
      permissions: { contents: "read" },
      githubPushedAt: "2026-08-31T01:00:00.000Z",
      headSha: "abc123",
    });
    expect(repo.provider).toBe("github");
    expect(repo.githubInstallationId).toBe(saved.id);
    expect(repo.githubRepositoryId).toBe(555001);
    expect(repo).not.toHaveProperty("token");
    expect(JSON.stringify(repo)).not.toContain("ghs_");
  });

  it("consumes an install nonce only once", async () => {
    const store = createMemoryGitHubStore();
    await store.createInstallNonce(
      DEMO_USER_ID,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-31T12:10:00.000Z",
    );
    expect(
      await store.consumeInstallNonce(
        DEMO_USER_ID,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "2026-08-31T12:00:00.000Z",
      ),
    ).toBe("consumed");
    expect(
      await store.consumeInstallNonce(
        DEMO_USER_ID,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "2026-08-31T12:01:00.000Z",
      ),
    ).toBe("reused");
  });
});
