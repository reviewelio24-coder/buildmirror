import { describe, expect, it } from "vitest";
import { PROJECT_IDS, SNAPSHOT_IDS } from "@/lib/ids";
import { projectHomePath } from "@/lib/navigation/paths";
import { resolveSwitchRedirect } from "@/lib/projects/switch-project";
import { prepareViewStateInput, viewStateUnchanged } from "@/lib/projects/view-state";

describe("view state preparation", () => {
  it("drops another project's snapshot and extra filters", () => {
    const prepared = prepareViewStateInput(
      PROJECT_IDS.a,
      {
        route: `/projects/${PROJECT_IDS.b}`,
        snapshotId: SNAPSHOT_IDS.b,
        filters: { snapshot: SNAPSHOT_IDS.b, tab: "x" },
      },
      [SNAPSHOT_IDS.a],
    );
    expect(prepared.route).toBe(projectHomePath(PROJECT_IDS.a));
    expect(prepared.snapshotId).toBeNull();
    expect(prepared.filters).toEqual({});
  });

  it("keeps a same-project settings route and owned snapshot", () => {
    const prepared = prepareViewStateInput(
      PROJECT_IDS.a,
      {
        route: `/projects/${PROJECT_IDS.a}/settings`,
        snapshotId: SNAPSHOT_IDS.a,
        filters: { snapshot: SNAPSHOT_IDS.a },
      },
      [SNAPSHOT_IDS.a],
    );
    expect(prepared.route).toBe(`/projects/${PROJECT_IDS.a}/settings`);
    expect(prepared.snapshotId).toBe(SNAPSHOT_IDS.a);
    expect(prepared.filters).toEqual({ snapshot: SNAPSHOT_IDS.a });
  });

  it("skips unchanged view state writes", () => {
    const next = {
      route: `/projects/${PROJECT_IDS.a}`,
      snapshotId: SNAPSHOT_IDS.a,
      filters: { snapshot: SNAPSHOT_IDS.a },
    };
    expect(viewStateUnchanged(next, next)).toBe(true);
    expect(viewStateUnchanged(null, next)).toBe(false);
  });
});

describe("project switch redirect", () => {
  it("falls back to the target project home for unsafe or foreign routes", () => {
    expect(
      resolveSwitchRedirect({
        toProjectId: PROJECT_IDS.b,
        toOwned: true,
        savedRoute: "//example.com",
        savedSnapshotId: SNAPSHOT_IDS.b,
        snapshotBelongsToTarget: true,
      }),
    ).toBe(projectHomePath(PROJECT_IDS.b));
    expect(
      resolveSwitchRedirect({
        toProjectId: PROJECT_IDS.b,
        toOwned: true,
        savedRoute: `/projects/${PROJECT_IDS.a}`,
        savedSnapshotId: SNAPSHOT_IDS.a,
        snapshotBelongsToTarget: false,
      }),
    ).toBe(projectHomePath(PROJECT_IDS.b));
  });

  it("does not follow an unowned target into an error-style path", () => {
    expect(
      resolveSwitchRedirect({
        toProjectId: "not-a-uuid",
        toOwned: false,
        savedRoute: "https://evil.example",
        savedSnapshotId: SNAPSHOT_IDS.a,
        snapshotBelongsToTarget: false,
      }),
    ).toBe("/projects");
    expect(
      resolveSwitchRedirect({
        toProjectId: PROJECT_IDS.b,
        toOwned: false,
        savedRoute: `/projects/${PROJECT_IDS.b}/settings`,
        savedSnapshotId: SNAPSHOT_IDS.b,
        snapshotBelongsToTarget: true,
      }),
    ).toBe(projectHomePath(PROJECT_IDS.b));
  });
});
