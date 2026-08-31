import { describe, expect, it } from "vitest";
import {
  buildProjectRedirect,
  isAllowedPostLoginPath,
  isProjectRoute,
  projectHomePath,
  resolveOwnedSnapshotId,
  sanitizeFilters,
  sanitizeInternalPath,
  sanitizeNextPath,
} from "@/lib/navigation/paths";
import { PROJECT_IDS, SNAPSHOT_IDS } from "@/lib/ids";

describe("path sanitization", () => {
  it("keeps a valid project home and settings path", () => {
    expect(sanitizeInternalPath(`/projects/${PROJECT_IDS.a}`)).toBe(
      `/projects/${PROJECT_IDS.a}`,
    );
    expect(sanitizeInternalPath(`/projects/${PROJECT_IDS.a}/settings`)).toBe(
      `/projects/${PROJECT_IDS.a}/settings`,
    );
  });

  it("blocks protocol-relative, scheme, and backslash redirects", () => {
    expect(sanitizeInternalPath("//example.com")).toBeNull();
    expect(sanitizeInternalPath("https://example.com")).toBeNull();
    expect(sanitizeInternalPath("/\\example.com")).toBeNull();
    expect(sanitizeInternalPath("\\\\example.com")).toBeNull();
    expect(sanitizeInternalPath("javascript:alert(1)")).toBeNull();
  });

  it("blocks encoded protocol-relative paths", () => {
    expect(sanitizeInternalPath("/%2F%2Fexample.com")).toBeNull();
    expect(sanitizeInternalPath("/%5Cexample.com")).toBeNull();
  });

  it("rejects routes that belong to another project", () => {
    expect(isProjectRoute(`/projects/${PROJECT_IDS.b}`, PROJECT_IDS.a)).toBe(
      false,
    );
    expect(isProjectRoute(`/projects/${PROJECT_IDS.a}/settings`, PROJECT_IDS.a)).toBe(
      true,
    );
  });

  it("falls back unsafe login next parameters", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/projects");
    expect(sanitizeNextPath("/login")).toBe("/projects");
    expect(sanitizeNextPath(`/projects/${PROJECT_IDS.a}`)).toBe(
      `/projects/${PROJECT_IDS.a}`,
    );
    expect(isAllowedPostLoginPath("/projects")).toBe(true);
  });

  it("keeps only snapshot filters", () => {
    expect(
      sanitizeFilters({ snapshot: SNAPSHOT_IDS.a, tab: "secret" }),
    ).toEqual({ snapshot: SNAPSHOT_IDS.a });
    expect(sanitizeFilters({ tab: "a" })).toEqual({});
  });

  it("does not attach another project's snapshot to a route", () => {
    expect(
      resolveOwnedSnapshotId(PROJECT_IDS.a, SNAPSHOT_IDS.b, [SNAPSHOT_IDS.a]),
    ).toBeNull();
    expect(
      resolveOwnedSnapshotId(PROJECT_IDS.a, SNAPSHOT_IDS.a, [SNAPSHOT_IDS.a]),
    ).toBe(SNAPSHOT_IDS.a);
  });

  it("falls back to the target project home when restoring an unsafe route", () => {
    expect(
      buildProjectRedirect(PROJECT_IDS.b, "//example.com", SNAPSHOT_IDS.b),
    ).toBe(projectHomePath(PROJECT_IDS.b));
    expect(
      buildProjectRedirect(
        PROJECT_IDS.b,
        `/projects/${PROJECT_IDS.a}`,
        SNAPSHOT_IDS.b,
      ),
    ).toBe(projectHomePath(PROJECT_IDS.b));
    expect(
      buildProjectRedirect(
        PROJECT_IDS.a,
        `/projects/${PROJECT_IDS.a}`,
        SNAPSHOT_IDS.a,
      ),
    ).toBe(`/projects/${PROJECT_IDS.a}?snapshot=${SNAPSHOT_IDS.a}`);
  });
});
