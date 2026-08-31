import { GitHubRepositoryLinkForm } from "@/components/projects/github-repository-link-form";
import { ProjectSettingsForms } from "@/components/projects/project-settings-forms";
import { requireUser } from "@/lib/auth/session";
import { getGitHubStore } from "@/lib/data/get-github-store";
import { getProjectStore } from "@/lib/data/get-project-store";
import { toUserErrorMessage } from "@/lib/errors";
import { getInstallationRepositorySource } from "@/lib/github/get-repository-source";
import { syncInstallationRepositories } from "@/lib/github/sync-repositories";
import type { Repository } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const store = await getProjectStore();
  const githubStore = await getGitHubStore();
  const dashboard = await store.getDashboard(user.id, projectId);
  const installations = await githubStore.listInstallations(user.id);
  const source = getInstallationRepositorySource(githubStore);
  const repositories: Repository[] = [];
  let syncError: string | null = null;

  for (const installation of installations) {
    if (installation.suspendedAt) {
      continue;
    }
    try {
      const synced = await syncInstallationRepositories({
        userId: user.id,
        installationId: installation.id,
        store: githubStore,
        source,
      });
      repositories.push(...synced);
    } catch (error) {
      syncError = toUserErrorMessage(error);
      repositories.push(
        ...(await githubStore.listInstallationRepositories(
          user.id,
          installation.id,
        )),
      );
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">프로젝트 설정</h2>
        <p className="mt-1 text-sm text-muted">
          이름 변경과 보관·삭제는 서버에서 소유권을 다시 확인합니다.
        </p>
      </div>
      <ProjectSettingsForms
        project={dashboard.project}
        repository={dashboard.repository}
      />
      <GitHubRepositoryLinkForm
        project={dashboard.project}
        activeRepository={dashboard.repository}
        installations={installations}
        repositories={repositories}
        syncError={syncError}
      />
    </div>
  );
}
