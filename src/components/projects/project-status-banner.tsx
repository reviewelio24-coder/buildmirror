import { STATUS_COPY } from "@/lib/copy";
import { JOB_STAGE_COPY } from "@/lib/copy";
import { formatDateTime, shortSha } from "@/lib/format";
import type { ProjectDashboard } from "@/lib/types/domain";
import { StatusBadge } from "@/components/ui/status-badge";

export function ProjectStatusBanner({
  dashboard,
}: {
  dashboard: ProjectDashboard;
}) {
  const { project, activeJob, latestFailedJob } = dashboard;
  const copy = STATUS_COPY[project.status];

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatusBadge status={project.status} showDescription />
          {project.status === "analyzing" && activeJob ? (
            <div className="mt-4">
              <p className="text-sm">
                {JOB_STAGE_COPY[activeJob.stage]} · 진행률 {activeJob.progress}%
              </p>
              <div
                className="mt-2 h-2 rounded bg-stone-200"
                role="progressbar"
                aria-valuenow={activeJob.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="분석 진행률"
              >
                <div
                  className="h-2 rounded bg-accent"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              {activeJob.errorMessage ? (
                <p className="mt-2 text-sm text-muted">{activeJob.errorMessage}</p>
              ) : null}
            </div>
          ) : null}
          {project.status === "failed" && latestFailedJob ? (
            <p className="mt-3 text-sm">
              실패 원인: {latestFailedJob.errorMessage ?? "알 수 없는 오류"}
              {latestFailedJob.errorCode
                ? ` (${latestFailedJob.errorCode})`
                : ""}
            </p>
          ) : null}
        </div>
        <p className="max-w-sm text-sm text-muted">{copy.description}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">저장된 분석 commit SHA</dt>
          <dd className="mt-1 font-mono">{shortSha(project.storedCommitSha)}</dd>
        </div>
        <div>
          <dt className="text-muted">최신 확인 commit SHA</dt>
          <dd className="mt-1 font-mono">
            {shortSha(project.latestKnownCommitSha)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">마지막 정상 분석</dt>
          <dd className="mt-1">
            {formatDateTime(dashboard.lastSuccessfulSnapshot?.completedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">마지막 GitHub 확인</dt>
          <dd className="mt-1">{formatDateTime(project.latestKnownAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
