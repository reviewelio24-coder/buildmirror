import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisHistory } from "@/components/projects/analysis-history";
import { IncrementalAnalysisButton } from "@/components/projects/incremental-analysis-button";
import { LearningTasks } from "@/components/projects/learning-tasks";
import { NotificationList } from "@/components/projects/notification-list";
import { ProjectStatusBanner } from "@/components/projects/project-status-banner";
import { ScorePanels } from "@/components/projects/score-panels";
import { DataSourceBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import { getProjectStore } from "@/lib/data/get-project-store";
import { formatDateTime, shortSha } from "@/lib/format";
import { loadProjectDashboard } from "@/lib/projects/load-dashboard";

export const dynamic = "force-dynamic";

export default async function ProjectHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const store = await getProjectStore();

  let viewState = null;
  try {
    viewState = await store.getViewState(user.id, projectId);
  } catch {
    notFound();
  }

  const snapshotId = query.snapshot ?? viewState?.snapshotId ?? null;
  const dashboard = await loadProjectDashboard(user.id, projectId, snapshotId);

  await store.saveViewState(user.id, projectId, {
    route: `/projects/${projectId}`,
    snapshotId: dashboard.displayedSnapshot?.id ?? null,
    filters: query.snapshot ? { snapshot: query.snapshot } : {},
  });

  const disabledReason = dashboard.project.archivedAt
    ? "보관된 프로젝트는 자동 변경 감지를 하지 않습니다."
    : dashboard.repository?.connectionStatus === "disconnected"
      ? "GitHub 연결이 없어 실제 분석을 시작할 수 없습니다. mock 저장소만 등록된 상태입니다."
      : dashboard.activeJob
        ? "이미 분석 작업이 진행 중입니다."
        : null;

  return (
    <div className="space-y-8">
      <ProjectStatusBanner dashboard={dashboard} />

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-base font-semibold">저장소와 브랜치</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">저장소</dt>
            <dd className="mt-1 font-mono">
              {dashboard.repository
                ? `${dashboard.repository.owner}/${dashboard.repository.name}`
                : "없음"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">기본 브랜치</dt>
            <dd className="mt-1 font-mono">
              {dashboard.repository?.defaultBranch ?? dashboard.project.analysisBranch}
            </dd>
          </div>
          <div>
            <dt className="text-muted">표시 중인 스냅샷 SHA</dt>
            <dd className="mt-1 font-mono">
              {shortSha(dashboard.displayedSnapshot?.commitSha)}
            </dd>
          </div>
        </dl>
        {dashboard.displayedSnapshot ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            이 화면의 점수와 과제는 스냅샷 기준입니다.
            <DataSourceBadge source={dashboard.displayedSnapshot.dataSource} />
            {dashboard.lastSuccessfulSnapshot &&
            dashboard.displayedSnapshot.id !== dashboard.lastSuccessfulSnapshot.id ? (
              <span>마지막 정상 스냅샷과 다른 기록을 보고 있습니다.</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            아직 분석 스냅샷이 없습니다. 분석 워커가 연결되면 여기에 결과가
            쌓입니다.
          </p>
        )}
      </section>

      {dashboard.project.status === "failed" && dashboard.lastSuccessfulSnapshot ? (
        <p className="text-sm">
          최신 분석은 실패했지만{" "}
          <Link
            href={`/projects/${projectId}?snapshot=${dashboard.lastSuccessfulSnapshot.id}`}
            className="underline"
          >
            {formatDateTime(dashboard.lastSuccessfulSnapshot.completedAt)} 정상
            스냅샷
          </Link>
          을 계속 볼 수 있습니다.
        </p>
      ) : null}

      {dashboard.project.status === "changes_detected" ? (
        <p className="text-sm">
          새 커밋이 있어도 기존 정상 분석 결과를 먼저 보여 줍니다. 아래 mock
          버튼으로 증분 분석 상태만 재현할 수 있습니다.
        </p>
      ) : null}

      <ScorePanels scores={dashboard.scores} />
      <IncrementalAnalysisButton
        projectId={projectId}
        disabledReason={disabledReason}
      />
      <LearningTasks
        tasks={dashboard.displayedSnapshot?.learningTasks ?? []}
      />
      <NotificationList notifications={dashboard.notifications} />
      <AnalysisHistory
        projectId={projectId}
        snapshots={dashboard.recentSnapshots}
        jobs={dashboard.recentJobs}
        selectedSnapshotId={dashboard.displayedSnapshot?.id ?? null}
      />
    </div>
  );
}
