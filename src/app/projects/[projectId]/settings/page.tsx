import { ProjectSettingsForms } from "@/components/projects/project-settings-forms";
import { requireUser } from "@/lib/auth/session";
import { getProjectStore } from "@/lib/data/get-project-store";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const store = await getProjectStore();
  const dashboard = await store.getDashboard(user.id, projectId);

  await store.saveViewState(user.id, projectId, {
    route: `/projects/${projectId}/settings`,
    snapshotId: dashboard.viewState?.snapshotId ?? dashboard.displayedSnapshot?.id ?? null,
    filters: {},
  });

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
    </div>
  );
}
