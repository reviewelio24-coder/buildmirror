import { GitHubInstallCard } from "@/components/projects/github-install-card";
import { ProjectList } from "@/components/projects/project-list";
import { requireUser } from "@/lib/auth/session";
import { getGitHubStore } from "@/lib/data/get-github-store";
import { getProjectStore } from "@/lib/data/get-project-store";
import { isGitHubAppInstallReady } from "@/lib/github/install-url";
import { GITHUB_SETUP_ERROR_COPY, parseGitHubSetupError } from "@/lib/github/setup";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const store = await getProjectStore();
  const githubStore = await getGitHubStore();
  const projects = await store.listProjectSummaries(user.id, {
    visibility: "all",
  });
  const installations = await githubStore.listInstallations(user.id);
  const errorCode = parseGitHubSetupError(query.github);
  const message =
    query.github === "connected"
      ? null
      : errorCode
        ? GITHUB_SETUP_ERROR_COPY[errorCode]
        : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">프로젝트</h1>
      <p className="mt-2 text-sm text-muted">
        계정 안에서 여러 프로젝트를 만들고 전환할 수 있습니다. 각 프로젝트의
        분석·점수·학습 기록은 분리됩니다.
      </p>
      <div className="mt-8">
        <GitHubInstallCard
          installations={installations}
          appConfigured={isGitHubAppInstallReady()}
          message={message}
          messageTone={errorCode === "pending_approval" ? "notice" : "error"}
        />
      </div>
      {query.github === "connected" ? (
        <p className="mt-4 text-sm">GitHub App 설치가 이 계정에 연결됐습니다.</p>
      ) : null}
      <div className="mt-8">
        <ProjectList projects={projects} />
      </div>
    </div>
  );
}
