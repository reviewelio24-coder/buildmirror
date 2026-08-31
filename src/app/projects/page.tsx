import { ProjectList } from "@/components/projects/project-list";
import { requireUser } from "@/lib/auth/session";
import { getProjectStore } from "@/lib/data/get-project-store";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const store = await getProjectStore();
  const projects = await store.listProjectSummaries(user.id, {
    visibility: "all",
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">프로젝트</h1>
      <p className="mt-2 text-sm text-muted">
        계정 안에서 여러 프로젝트를 만들고 전환할 수 있습니다. 각 프로젝트의
        분석·점수·학습 기록은 분리됩니다.
      </p>
      <div className="mt-8">
        <ProjectList projects={projects} />
      </div>
    </div>
  );
}
