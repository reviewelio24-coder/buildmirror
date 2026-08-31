import { describe, expect, it } from "vitest";
import { MockRepositoryProvider } from "@/lib/adapters/mock-repository-provider";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { COMMIT_SHAS, DEMO_USER_ID, PROJECT_IDS, SNAPSHOT_IDS } from "@/lib/ids";
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
      snapshotId: SNAPSHOT_IDS.a,
      filters: { snapshot: SNAPSHOT_IDS.a },
    });
    await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.b, {
      route: `/projects/${PROJECT_IDS.b}`,
      snapshotId: SNAPSHOT_IDS.b,
      filters: { snapshot: SNAPSHOT_IDS.b },
    });

    const aState = await store.getViewState(DEMO_USER_ID, PROJECT_IDS.a);
    const bState = await store.getViewState(DEMO_USER_ID, PROJECT_IDS.b);
    expect(aState?.filters.snapshot).toBe(SNAPSHOT_IDS.a);
    expect(bState?.filters.snapshot).toBe(SNAPSHOT_IDS.b);
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

describe("mock project isolation rules", () => {
  it("restores each project's view state after A → B → A", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.a, {
      route: `/projects/${PROJECT_IDS.a}/settings`,
      snapshotId: SNAPSHOT_IDS.a,
      filters: { snapshot: SNAPSHOT_IDS.a },
    });
    await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.b, {
      route: `/projects/${PROJECT_IDS.b}`,
      snapshotId: SNAPSHOT_IDS.b,
      filters: {},
    });

    const restored = await store.getViewState(DEMO_USER_ID, PROJECT_IDS.a);
    expect(restored?.route).toBe(`/projects/${PROJECT_IDS.a}/settings`);
    expect(restored?.snapshotId).toBe(SNAPSHOT_IDS.a);
  });

  it("does not store another project's snapshot on the current project", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    const saved = await store.saveViewState(DEMO_USER_ID, PROJECT_IDS.a, {
      route: `/projects/${PROJECT_IDS.a}`,
      snapshotId: SNAPSHOT_IDS.b,
      filters: { snapshot: SNAPSHOT_IDS.b, tab: "secret" },
    });
    expect(saved.snapshotId).toBeNull();
    expect(saved.filters).toEqual({});
    const dashboard = await store.getDashboard(
      DEMO_USER_ID,
      PROJECT_IDS.a,
      SNAPSHOT_IDS.b,
    );
    expect(dashboard.invalidSnapshotRequested).toBe(true);
    expect(dashboard.displayedSnapshot?.id).toBe(SNAPSHOT_IDS.a);
  });

  it("keeps the last successful snapshot after the latest analysis failed", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    const dashboard = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.c);
    expect(dashboard.project.status).toBe("failed");
    expect(dashboard.latestFailedJob?.status).toBe("failed");
    expect(dashboard.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.cGood);
    expect(dashboard.project.lastSuccessfulSnapshotId).toBe(SNAPSHOT_IDS.cGood);
  });

  it("deletes only the target project's data", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    await store.deleteProject(DEMO_USER_ID, PROJECT_IDS.a);
    await expect(
      store.getProject(DEMO_USER_ID, PROJECT_IDS.a),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    const remaining = await store.listProjectSummaries(DEMO_USER_ID, {
      visibility: "all",
    });
    expect(remaining.map((item) => item.project.id)).toEqual(
      expect.arrayContaining([PROJECT_IDS.b, PROJECT_IDS.c, PROJECT_IDS.e]),
    );
    expect(remaining.map((item) => item.project.id)).not.toContain(PROJECT_IDS.a);
    const b = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.b);
    expect(b.displayedSnapshot?.id).toBe(SNAPSHOT_IDS.b);
  });

  it("still returns history for an archived project", async () => {
    const store = createMemoryProjectStore(createDemoStoreData());
    const archived = await store.getDashboard(DEMO_USER_ID, PROJECT_IDS.e);
    expect(archived.project.status).toBe("archived");
    expect(archived.displayedSnapshot?.id).toBe(SNAPSHOT_IDS.e);
    expect(archived.scores?.snapshotId).toBe(SNAPSHOT_IDS.e);
  });
});
