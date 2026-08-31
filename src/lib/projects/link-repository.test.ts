import { describe, expect, it } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { createDemoGitHubCatalog } from "@/lib/github/mock-catalog";
import { StaticCatalogRepositorySource } from "@/lib/github/sync-repositories";
import {
  linkProjectGitHubRepository,
  unlinkProjectGitHubRepository,
} from "@/lib/projects/link-repository";
import {
  DEMO_USER_ID,
  MOCK_GITHUB_INSTALLATION_IDS,
  MOCK_GITHUB_REPOSITORY_IDS,
  PROJECT_IDS,
  SNAPSHOT_IDS,
} from "@/lib/ids";
import { createDemoStoreData } from "@/lib/mock/seed";

const USER_B = "00000000-0000-0000-0000-00000000000b";

function createStores() {
  const demo = createDemoGitHubCatalog();
  const projectData = createDemoStoreData();
  const githubStore = createMemoryGitHubStore({
    installations: demo.installations,
    catalogs: demo.catalogs,
    repositories: projectData.repositories,
  });
  const projectStore = createMemoryProjectStore(projectData);
  const source = new StaticCatalogRepositorySource(demo.catalogs);
  return { githubStore, projectStore, source, demo };
}

describe("linkProjectGitHubRepository", () => {
  it("blocks linking another user's installation to a project", async () => {
    const { githubStore, projectStore, source } = createStores();
    const otherProject = await projectStore.createProject(USER_B, {
      name: "다른 사용자 프로젝트",
      repositoryOwner: "user-b",
      repositoryName: "other",
      defaultBranch: "main",
    });
    await expect(
      linkProjectGitHubRepository({
        userId: USER_B,
        projectId: otherProject.id,
        installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
        githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.notes,
        projectStore,
        githubStore,
        source,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_NOT_FOUND" });
  });

  it("rejects a client-supplied repository ID that is not in the installation list", async () => {
    const { githubStore, projectStore, source } = createStores();
    await expect(
      linkProjectGitHubRepository({
        userId: DEMO_USER_ID,
        projectId: PROJECT_IDS.a,
        installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
        githubRepositoryId: 999999,
        projectStore,
        githubStore,
        source,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_NOT_IN_INSTALLATION" });
  });

  it("blocks archived and disabled repositories from new links", async () => {
    const { githubStore, projectStore, source } = createStores();
    await expect(
      linkProjectGitHubRepository({
        userId: DEMO_USER_ID,
        projectId: PROJECT_IDS.a,
        installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
        githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.archived,
        projectStore,
        githubStore,
        source,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_ARCHIVED" });
    await expect(
      linkProjectGitHubRepository({
        userId: DEMO_USER_ID,
        projectId: PROJECT_IDS.a,
        installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
        githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.disabled,
        projectStore,
        githubStore,
        source,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_DISABLED" });
  });

  it("isolates repositories between projects A and B and keeps them after A→B→A", async () => {
    const { githubStore, projectStore, source } = createStores();
    await linkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.a,
      installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
      githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.notes,
      projectStore,
      githubStore,
      source,
    });
    await linkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.b,
      installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
      githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.dashboard,
      projectStore,
      githubStore,
      source,
    });

    const a = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    const b = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.b);
    expect(a.repository?.githubRepositoryId).toBe(MOCK_GITHUB_REPOSITORY_IDS.notes);
    expect(b.repository?.githubRepositoryId).toBe(
      MOCK_GITHUB_REPOSITORY_IDS.dashboard,
    );
    expect(a.repository?.id).not.toBe(b.repository?.id);

    const aAgain = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(aAgain.repository?.githubRepositoryId).toBe(
      MOCK_GITHUB_REPOSITORY_IDS.notes,
    );
    expect(aAgain.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);
    expect(b.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.b);
  });

  it("changes the active repository without deleting previous snapshots", async () => {
    const { githubStore, projectStore, source } = createStores();
    await linkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.a,
      installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
      githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.notes,
      projectStore,
      githubStore,
      source,
    });
    const afterFirst = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(afterFirst.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);

    await linkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.a,
      installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
      githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.privateApi,
      projectStore,
      githubStore,
      source,
    });
    const afterChange = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(afterChange.repository?.githubRepositoryId).toBe(
      MOCK_GITHUB_REPOSITORY_IDS.privateApi,
    );
    expect(afterChange.repository?.isPrivate).toBe(true);
    expect(afterChange.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);
    expect(afterChange.recentSnapshots.some((item) => item.id === SNAPSHOT_IDS.a)).toBe(
      true,
    );
  });

  it("unlinks a repository without deleting snapshots or scores", async () => {
    const { githubStore, projectStore, source } = createStores();
    await linkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.a,
      installationId: MOCK_GITHUB_INSTALLATION_IDS.user,
      githubRepositoryId: MOCK_GITHUB_REPOSITORY_IDS.notes,
      projectStore,
      githubStore,
      source,
    });
    await unlinkProjectGitHubRepository({
      userId: DEMO_USER_ID,
      projectId: PROJECT_IDS.a,
      projectStore,
    });
    const afterUnlink = await projectStore.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(afterUnlink.project.activeRepositoryId).toBeNull();
    expect(afterUnlink.repository).toBeNull();
    expect(afterUnlink.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);
    expect(afterUnlink.scores?.snapshotId).toBe(SNAPSHOT_IDS.a);
    expect(afterUnlink.displayedSnapshot?.learningTasks.length).toBeGreaterThan(0);
  });
});
