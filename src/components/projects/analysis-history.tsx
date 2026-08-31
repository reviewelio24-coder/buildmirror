import Link from "next/link";
import { JOB_STAGE_COPY } from "@/lib/copy";
import { DataSourceBadge } from "@/components/ui/status-badge";
import { formatDateTime, shortSha } from "@/lib/format";
import type { AnalysisJob, AnalysisSnapshot } from "@/lib/types/domain";

export function AnalysisHistory({
  projectId,
  snapshots,
  jobs,
  selectedSnapshotId,
}: {
  projectId: string;
  snapshots: AnalysisSnapshot[];
  jobs: AnalysisJob[];
  selectedSnapshotId: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h2 className="text-base font-semibold">분석 스냅샷</h2>
        <p className="mt-1 text-sm text-muted">
          결과는 덮어쓰지 않고 commit SHA 기준으로 구분합니다.
        </p>
        {snapshots.length === 0 ? (
          <p className="mt-3 text-sm text-muted">스냅샷이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <Link
                  href={`/projects/${projectId}?snapshot=${snapshot.id}`}
                  className={`block px-3 py-3 text-sm hover:bg-stone-50 ${
                    selectedSnapshotId === snapshot.id ? "bg-stone-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{shortSha(snapshot.commitSha)}</span>
                    <DataSourceBadge source={snapshot.dataSource} />
                  </div>
                  <p className="mt-1 text-muted">
                    {snapshot.branch} · {snapshot.status} ·{" "}
                    {formatDateTime(snapshot.completedAt ?? snapshot.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    engine {snapshot.analysisEngineVersion} · constitution{" "}
                    {snapshot.constitutionVersion}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-base font-semibold">최근 분석 작업</h2>
        <p className="mt-1 text-sm text-muted">
          실제 워커 실행이 아니라 상태 표현입니다.
        </p>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">작업 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
            {jobs.map((job) => (
              <li key={job.id} className="px-3 py-3 text-sm">
                <p>
                  {job.type} · {JOB_STAGE_COPY[job.stage]} · {job.progress}%
                </p>
                <p className="mt-1 text-muted">
                  {formatDateTime(job.createdAt)}
                  {job.errorMessage ? ` · ${job.errorMessage}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
