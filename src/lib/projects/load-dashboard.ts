import { getRepositoryProvider } from "@/lib/adapters/get-repository-provider";
import { getProjectStore } from "@/lib/data/get-project-store";
import { deriveProjectStatus, shouldCheckFreshness } from "@/lib/projects/status";
import type { ProjectDashboard } from "@/lib/types/domain";

export async function loadProjectDashboard(
  userId: string,
  projectId: string,
  snapshotId?: string | null,
): Promise<ProjectDashboard> {
  const store = await getProjectStore();
  const initial = await store.getDashboard(userId, projectId, snapshotId);

  const repository = initial.repository;
  if (
    !repository ||
    !shouldCheckFreshness({
      archivedAt: initial.project.archivedAt,
      connectionStatus: repository.connectionStatus,
      provider: repository.provider,
    })
  ) {
    return initial;
  }

  const checkedAt = new Date().toISOString();
  try {
    const headSha = await getRepositoryProvider().getHeadSha(repository);
    const nextStatus = deriveProjectStatus({
      archivedAt: initial.project.archivedAt,
      connectionStatus: repository.connectionStatus,
      hasActiveJob: Boolean(initial.activeJob),
      latestJobFailed: Boolean(
        initial.latestFailedJob &&
          (!initial.lastSuccessfulSnapshot ||
            initial.latestFailedJob.createdAt >
              (initial.lastSuccessfulSnapshot.completedAt ?? "")),
      ),
      freshnessCheckFailed: false,
      storedCommitSha: initial.project.storedCommitSha,
      latestKnownCommitSha: headSha,
    });
    await store.updateFreshness(userId, projectId, {
      latestKnownCommitSha: headSha,
      latestKnownAt: checkedAt,
      status: nextStatus,
      repositoryHeadSha: headSha,
    });
  } catch {
    const nextStatus = deriveProjectStatus({
      archivedAt: initial.project.archivedAt,
      connectionStatus: repository.connectionStatus,
      hasActiveJob: Boolean(initial.activeJob),
      latestJobFailed: Boolean(
        initial.latestFailedJob &&
          (!initial.lastSuccessfulSnapshot ||
            initial.latestFailedJob.createdAt >
              (initial.lastSuccessfulSnapshot.completedAt ?? "")),
      ),
      freshnessCheckFailed: true,
      storedCommitSha: initial.project.storedCommitSha,
      latestKnownCommitSha: initial.project.latestKnownCommitSha,
    });
    await store.updateFreshness(userId, projectId, {
      latestKnownCommitSha: initial.project.latestKnownCommitSha,
      latestKnownAt: initial.project.latestKnownAt ?? checkedAt,
      status: nextStatus,
    });
  }

  return store.getDashboard(userId, projectId, snapshotId);
}
