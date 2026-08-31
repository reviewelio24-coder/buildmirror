import { describe, expect, it } from "vitest";
import { MockRepositoryProvider } from "@/lib/adapters/mock-repository-provider";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { COMMIT_SHAS, DEMO_USER_ID, PROJECT_IDS } from "@/lib/ids";
import { createDemoStoreData } from "@/lib/mock/seed";
import { snapshotIdentityKey } from "@/lib/projects/snapshot";

describe("mock A/B/C isolation", () => {
  it("keeps analysis, scores, and notifications scoped to each project", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    const a = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    const b = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.b);
    const c = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.c);

    expect(a.project.status).toBe("up_to_date");
    expect(a.project.storedCommitSha).toBe(a.project.latestKnownCommitSha);
    expect(a.lastSuccessfulSnapshot?.commitSha).toBe(COMMIT_SHAS.a);

    expect(b.project.status).toBe("changes_detected");
    expect(b.project.storedCommitSha).not.toBe(b.project.latestKnownCommitSha);
    expect(b.displayedSnapshot?.commitSha).toBe(COMMIT_SHAS.bStored);
    expect(b.scores?.snapshotId).toBe(b.lastSuccessfulSnapshot?.id);

    expect(c.project.status).toBe("failed");
    expect(c.latestFailedJob?.status).toBe("failed");
    expect(c.lastSuccessfulSnapshot?.commitSha).toBe(COMMIT_SHAS.cStored);
    expect(c.displayedSnapshot?.id).toBe(c.lastSuccessfulSnapshot?.id);

    expect(a.notifications.every((item) => item.projectId === PROJECT_IDS.a)).toBe(
      true,
    );
    expect(b.notifications.every((item) => item.projectId === PROJECT_IDS.b)).toBe(
      true,
    );
    expect(c.scores?.snapshotId).not.toBe(a.scores?.snapshotId);
  });

  it("identifies snapshots by project, repo, branch, SHA, and versions", () => {
    const data = createDemoStoreData();
    const keys = data.snapshots.map(snapshotIdentityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not mix view state when switching projects", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.a, {
      route: `/projects/${PROJECT_IDS.a}/settings`,
      snapshotId: "snapshot-a",
      filters: { tab: "a" },
    });
    await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.b, {
      route: `/projects/${PROJECT_IDS.b}`,
      snapshotId: "snapshot-b",
      filters: { tab: "b" },
    });

    const aState = await store.getViewState(DEMO_USER_ID, PROJECT_IDS.a);
    const bState = await store.getViewState(DEMO_USER_ID, PROJECT_IDS.b);
    expect(aState?.filters.tab).toBe("a");
    expect(bState?.filters.tab).toBe("b");
    expect(aState?.route).toContain(PROJECT_IDS.a);
    expect(bState?.route).toContain(PROJECT_IDS.b);
  });

  it("reproduces A/B/C head SHAs through the mock repository provider", async () => {
    const provider = new MockRepositoryProvider();
    const data = createDemoStoreData();
    const repoA = data.repositories.find((item) => item.id === data.projects[0].activeRepositoryId);
    const repoB = data.repositories.find((item) => item.id === data.projects[1].activeRepositoryId);
    const repoC = data.repositories.find((item) => item.id === data.projects[2].activeRepositoryId);
    expect(repoA && (await provider.getHeadSha(repoA))).toBe(COMMIT_SHAS.a);
    expect(repoB && (await provider.getHeadSha(repoB))).toBe(COMMIT_SHAS.bLatest);
    expect(repoC && (await provider.getHeadSha(repoC))).toBe(COMMIT_SHAS.cFailed);
  });
});
