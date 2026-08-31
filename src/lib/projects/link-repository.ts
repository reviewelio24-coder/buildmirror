import { AppError } from "@/lib/errors";
import type { GitHubStore } from "@/lib/data/github-store";
import type { ProjectStore } from "@/lib/data/project-store";
import {
  assertUsableInstallation,
  type InstallationRepositorySource,
  toRecordGitHubRepositoryInput,
} from "@/lib/github/sync-repositories";
import type { MappedGitHubRepository } from "@/lib/github/types";
import type { Project } from "@/lib/types/domain";

function linkBlockReason(
  mapped: MappedGitHubRepository,
): "archived" | "disabled" | null {
  if (mapped.isDisabled) {
    return "disabled";
  }
  if (mapped.isArchived) {
    return "archived";
  }
  return null;
}

export async function linkProjectGitHubRepository(input: {
  userId: string;
  projectId: string;
  installationId: string;
  githubRepositoryId: number;
  projectStore: ProjectStore;
  githubStore: GitHubStore;
  source: InstallationRepositorySource;
  now?: Date;
}): Promise<Project> {
  const project = await input.projectStore.getProject(
    input.userId,
    input.projectId,
  );
  const installation = await assertUsableInstallation(
    input.githubStore,
    input.userId,
    input.installationId,
  );
  const live = await input.source.list(installation);
  const mapped = live.find(
    (item) => item.githubRepositoryId === input.githubRepositoryId,
  );
  if (!mapped) {
    throw new AppError({
      userMessage: "이 설치에서 해당 저장소를 찾을 수 없습니다.",
      developerCause:
        "githubRepositoryId was not present in the installation API list",
      code: "GITHUB_REPOSITORY_NOT_IN_INSTALLATION",
      status: 403,
    });
  }
  const blocked = linkBlockReason(mapped);
  if (blocked === "archived") {
    throw new AppError({
      userMessage: "보관된 저장소는 새로 연결할 수 없습니다.",
      developerCause: "archived repository cannot be newly linked",
      code: "GITHUB_REPOSITORY_ARCHIVED",
      status: 409,
    });
  }
  if (blocked === "disabled") {
    throw new AppError({
      userMessage: "비활성화된 저장소는 연결할 수 없습니다.",
      developerCause: "disabled repository cannot be linked",
      code: "GITHUB_REPOSITORY_DISABLED",
      status: 409,
    });
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  const repository = await input.githubStore.recordRepository(
    input.userId,
    toRecordGitHubRepositoryInput(installation.id, mapped, nowIso),
  );
  if (repository.userId !== project.userId) {
    throw new AppError({
      userMessage: "다른 계정의 저장소는 연결할 수 없습니다.",
      developerCause: "repository user does not match project user",
      code: "GITHUB_REPOSITORY_USER_MISMATCH",
      status: 403,
    });
  }
  return input.projectStore.linkPrimaryRepository(
    input.userId,
    input.projectId,
    repository,
  );
}

export async function unlinkProjectGitHubRepository(input: {
  userId: string;
  projectId: string;
  projectStore: ProjectStore;
}): Promise<Project> {
  await input.projectStore.getProject(input.userId, input.projectId);
  return input.projectStore.unlinkPrimaryRepository(
    input.userId,
    input.projectId,
  );
}
