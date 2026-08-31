import type {
  ProjectStatus,
  RepositoryConnectionStatus,
} from "@/lib/types/domain";

export type StatusDerivationInput = {
  archivedAt: string | null;
  connectionStatus: RepositoryConnectionStatus;
  hasActiveJob: boolean;
  latestJobFailed: boolean;
  freshnessCheckFailed: boolean;
  storedCommitSha: string | null;
  latestKnownCommitSha: string | null;
};

export function deriveProjectStatus(
  input: StatusDerivationInput,
): ProjectStatus {
  if (input.archivedAt) {
    return "archived";
  }
  if (input.connectionStatus !== "connected") {
    return "disconnected";
  }
  if (input.hasActiveJob) {
    return "analyzing";
  }
  if (input.latestJobFailed) {
    return "failed";
  }
  if (input.freshnessCheckFailed) {
    return "stale";
  }
  if (
    input.storedCommitSha &&
    input.latestKnownCommitSha &&
    input.storedCommitSha !== input.latestKnownCommitSha
  ) {
    return "changes_detected";
  }
  return "up_to_date";
}

export function shouldCheckFreshness(input: {
  archivedAt: string | null;
  connectionStatus: RepositoryConnectionStatus;
  provider?: string;
}): boolean {
  return (
    !input.archivedAt &&
    input.connectionStatus === "connected" &&
    input.provider !== "github"
  );
}
