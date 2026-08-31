import { startGitHubInstallAction } from "@/app/actions";
import { githubInstallationUiStatus } from "@/lib/github/setup";
import type { GitHubInstallation } from "@/lib/types/domain";

const STATUS_COPY = {
  connected: "연결 정상",
  suspended: "연결 중단",
  permission_error: "권한 오류",
  deleted: "설치 제거됨",
} as const;

export function GitHubInstallCard({
  installations,
  appConfigured,
  message,
  messageTone = "error",
}: {
  installations: GitHubInstallation[];
  appConfigured: boolean;
  message: string | null;
  messageTone?: "error" | "notice";
}) {
  const primary = installations[0] ?? null;
  const status = primary ? githubInstallationUiStatus(primary) : null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">GitHub App</h2>
      <p className="mt-1 text-sm text-muted">
        프로젝트 설정에서 저장소를 고를 수 있습니다. 지금은 설치와 계정 연결을
        확인합니다.
      </p>
      {message ? (
        <p
          className={`mt-3 text-sm ${messageTone === "notice" ? "text-warning" : "text-danger"}`}
        >
          {message}
        </p>
      ) : null}
      {primary ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">연결된 계정</dt>
            <dd className="mt-1 font-medium">{primary.accountLogin}</dd>
          </div>
          <div>
            <dt className="text-muted">계정 종류</dt>
            <dd className="mt-1">
              {primary.accountType === "Organization" ? "조직" : "개인 계정"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">상태</dt>
            <dd className="mt-1">{status ? STATUS_COPY[status] : "미연결"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">아직 연결된 GitHub App 설치가 없습니다.</p>
      )}
      {appConfigured ? (
        <form action={startGitHubInstallAction} className="mt-4">
          <input type="hidden" name="returnTo" value="/projects" />
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            {primary ? "다시 설치" : "GitHub App 설치"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">
          mock 모드이거나 GitHub App 환경변수가 없어 설치를 시작하지 않습니다.
          프로젝트 목록은 그대로 사용할 수 있습니다.
        </p>
      )}
    </section>
  );
}
