"use client";

import { useActionState } from "react";
import {
  archiveProjectAction,
  deleteProjectAction,
  reactivateProjectAction,
  renameProjectAction,
  type ActionState,
} from "@/app/actions";
import type { Project, Repository } from "@/lib/types/domain";

const initial: ActionState = { error: null };

export function ProjectSettingsForms({
  project,
  repository,
}: {
  project: Project;
  repository: Repository | null;
}) {
  const rename = renameProjectAction.bind(null, project.id);
  const remove = deleteProjectAction.bind(null, project.id, project.name);
  const [renameState, renameFormAction, renamePending] = useActionState(
    rename,
    initial,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    remove,
    initial,
  );

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">프로젝트 이름</h2>
        <form action={renameFormAction} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            name="name"
            defaultValue={project.name}
            maxLength={80}
            className="w-full rounded border border-border bg-background px-3 py-2"
          />
          <button
            type="submit"
            disabled={renamePending}
            className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            저장
          </button>
        </form>
        {renameState.error ? (
          <p className="mt-2 text-sm text-danger">{renameState.error}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">저장소 정보</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">owner / name</dt>
            <dd className="mt-1 font-mono">
              {repository
                ? `${repository.owner}/${repository.name}`
                : "연결되지 않음"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">기본 브랜치</dt>
            <dd className="mt-1 font-mono">
              {repository?.defaultBranch ?? project.analysisBranch}
            </dd>
          </div>
          <div>
            <dt className="text-muted">provider</dt>
            <dd className="mt-1 font-mono">{repository?.provider ?? "없음"}</dd>
          </div>
          <div>
            <dt className="text-muted">연결 상태</dt>
            <dd className="mt-1">{repository?.connectionStatus ?? "disconnected"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-base font-semibold">저장소 연결 변경</h2>
        <p className="mt-2 text-sm text-muted">
          GitHub App 연동 후 이 영역에서 저장소를 변경할 수 있습니다. 지금은
          구현되어 있지 않습니다.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 rounded border border-border px-4 py-2 text-sm opacity-50"
        >
          저장소 변경 (미구현)
        </button>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">보관</h2>
        <p className="mt-2 text-sm text-muted">
          보관하면 자동 변경 감지를 중지합니다. 기존 분석과 학습 기록은 열람할 수
          있습니다.
        </p>
        {project.archivedAt ? (
          <form action={reactivateProjectAction.bind(null, project.id)} className="mt-3">
            <button
              type="submit"
              className="rounded border border-border px-4 py-2 text-sm hover:bg-stone-100"
            >
              프로젝트 재활성화
            </button>
          </form>
        ) : (
          <form action={archiveProjectAction.bind(null, project.id)} className="mt-3">
            <button
              type="submit"
              className="rounded border border-border px-4 py-2 text-sm hover:bg-stone-100"
            >
              프로젝트 보관
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-danger/30 bg-surface p-5">
        <h2 className="text-base font-semibold">프로젝트 삭제</h2>
        <p className="mt-2 text-sm text-muted">
          삭제는 서버에서 소유권을 다시 확인합니다. 확인을 위해 프로젝트 이름{" "}
          <span className="font-medium text-foreground">{project.name}</span> 을
          입력하세요.
        </p>
        <form action={deleteFormAction} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            name="confirmName"
            placeholder={project.name}
            className="w-full rounded border border-border bg-background px-3 py-2"
          />
          <button
            type="submit"
            disabled={deletePending}
            className="rounded bg-danger px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            삭제
          </button>
        </form>
        {deleteState.error ? (
          <p className="mt-2 text-sm text-danger">{deleteState.error}</p>
        ) : null}
      </section>
    </div>
  );
}
