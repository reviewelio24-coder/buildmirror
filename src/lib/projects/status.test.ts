import { describe, expect, it } from "vitest";
import { deriveProjectStatus } from "@/lib/projects/status";

describe("deriveProjectStatus", () => {
  const base = {
    archivedAt: null,
    connectionStatus: "connected" as const,
    hasActiveJob: false,
    latestJobFailed: false,
    freshnessCheckFailed: false,
    storedCommitSha: "aaa",
    latestKnownCommitSha: "aaa",
  };

  it("archives first", () => {
    expect(
      deriveProjectStatus({ ...base, archivedAt: "2026-08-20T00:00:00.000Z" }),
    ).toBe("archived");
  });

  it("marks disconnected repositories", () => {
    expect(
      deriveProjectStatus({ ...base, connectionStatus: "disconnected" }),
    ).toBe("disconnected");
  });

  it("keeps analyzing while a job is active even if SHAs differ", () => {
    expect(
      deriveProjectStatus({
        ...base,
        hasActiveJob: true,
        storedCommitSha: "old",
        latestKnownCommitSha: "new",
      }),
    ).toBe("analyzing");
  });

  it("keeps failed when the latest job failed", () => {
    expect(
      deriveProjectStatus({
        ...base,
        latestJobFailed: true,
        storedCommitSha: "old",
        latestKnownCommitSha: "new",
      }),
    ).toBe("failed");
  });

  it("marks stale when freshness check failed", () => {
    expect(deriveProjectStatus({ ...base, freshnessCheckFailed: true })).toBe(
      "stale",
    );
  });

  it("detects SHA mismatch as changes_detected", () => {
    expect(
      deriveProjectStatus({
        ...base,
        storedCommitSha: "old",
        latestKnownCommitSha: "new",
      }),
    ).toBe("changes_detected");
  });

  it("marks matching SHAs as up_to_date", () => {
    expect(deriveProjectStatus(base)).toBe("up_to_date");
  });
});
