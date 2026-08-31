"use client";

import { useActionState, useState } from "react";
import {
  linkGitHubRepositoryAction,
  unlinkGitHubRepositoryAction,
  type ActionState,
} from "@/app/actions";
import type { GitHubInstallation, Project, Repository } from "@/lib/types/domain";

const initial: ActionState = { error: null };

function connectionLabel(repository: Repository): string {
  if (repository.connectionStatus === "inaccessible") {
    return "접근 불가";
  }
  if (repository.isDisabled) {
    return "비활성화";
  }
  if (repository.isArchived) {
    return "보관됨";
  }
  if (repository.isPrivate) {
    return "비공개";
  }
  return "공개";
}

function canLinkRepository(repository: Repository): boolean {
  return (
    repository.connectionStatus === "connected" &&
    !repository.isArchived &&
    !repository.isDisabled
  );
}

export function GitHubRepositoryLinkForm({
  project,
  activeRepository,
  installations,
  repositories,
  syncError,
}: {
  project: Project;
  activeRepository: Repository | null;
  installations: GitHubInstallation[];
  repositories: Repository[];
  syncError: string | null;
}) {
  const usableInstallations = installations.filter((item) => !item.suspendedAt);
  const [installationId, setInstallationId] = useState(
    usableInstallations[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const linkAction = linkGitHubRepositoryAction.bind(null, project.id);
  const [linkState, linkFormAction, linkPending] = useActionState(
    linkAction,
    initial,
  );
  const unlinkAction = unlinkGitHubRepositoryAction.bind(null, project.id);
  const [unlinkState, unlinkFormAction, unlinkPending] = useActionState(
    unlinkAction,
    initial,
  );

  const selectedInstallation =
    usableInstallations.find((item) => item.id === installationId) ??
    usableInstallations[0] ??
    null;

  const keyword = query.trim().toLowerCase();
  const visibleRepositories = repositories.filter((item) => {
    if (!selectedInstallation) {
      return false;
    }
    if (item.githubInstallationId !== selectedInstallation.id) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const haystack = [item.owner, item.name, item.fullName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });

  if (usableInstallations.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-base font-semibold">저장소 연결</h2>
        <p className="mt-2 text-sm text-muted">
          연결된 GitHub 계정이 없습니다. 프로젝트 목록에서 GitHub App을 먼저
          설치하세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">저장소 연결</h2>
      <p className="mt-2 text-sm text-muted">
        서버가 설치 소유권을 다시 확인한 뒤, GitHub numeric repository ID로만
        연결합니다.
      </p>
      {syncError ? (
        <p className="mt-3 text-sm text-danger">{syncError}</p>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">연결된 GitHub 계정</dt>
          <dd className="mt-1 font-medium">
            {selectedInstallation
              ? `${selectedInstallation.accountLogin} (${selectedInstallation.accountType === "Organization" ? "조직" : "개인"})`
              : "없음"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">현재 프로젝트 저장소</dt>
          <dd className="mt-1 font-mono">
            {activeRepository
              ? `${activeRepository.owner}/${activeRepository.name}`
              : "연결되지 않음"}
          </dd>
        </div>
      </dl>

      {usableInstallations.length > 1 ? (
        <label className="mt-4 block text-sm">
          <span className="text-muted">GitHub 계정 선택</span>
          <select
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
            value={selectedInstallation?.id ?? ""}
            onChange={(event) => setInstallationId(event.target.value)}
          >
            {usableInstallations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.accountLogin}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-4 block text-sm">
        <span className="text-muted">저장소 검색</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="owner 또는 저장소 이름"
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
        />
      </label>

      <ul className="mt-4 divide-y divide-border rounded border border-border">
        {visibleRepositories.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted">표시할 저장소가 없습니다.</li>
        ) : (
          visibleRepositories.map((repository) => {
            const isActive =
              activeRepository?.id === repository.id ||
              (activeRepository?.githubRepositoryId !== null &&
                activeRepository?.githubRepositoryId ===
                  repository.githubRepositoryId);
            const linkable = canLinkRepository(repository);
            return (
              <li
                key={repository.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-sm">
                    {repository.fullName ?? `${repository.owner}/${repository.name}`}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {connectionLabel(repository)}
                    {isActive ? " · 이 프로젝트에 연결됨" : ""}
                  </p>
                </div>
                {isActive ? (
                  <span className="text-sm text-muted">연결됨</span>
                ) : linkable ? (
                  <form action={linkFormAction}>
                    <input
                      type="hidden"
                      name="installationId"
                      value={selectedInstallation?.id ?? ""}
                    />
                    <input
                      type="hidden"
                      name="githubRepositoryId"
                      value={String(repository.githubRepositoryId ?? "")}
                    />
                    <button
                      type="submit"
                      disabled={linkPending}
                      className="rounded border border-border px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60"
                    >
                      {activeRepository?.provider === "github"
                        ? "활성 저장소 변경"
                        : "연결"}
                    </button>
                  </form>
                ) : (
                  <span className="text-sm text-muted">연결 불가</span>
                )}
              </li>
            );
          })
        )}
      </ul>
      {linkState.error ? (
        <p className="mt-3 text-sm text-danger">{linkState.error}</p>
      ) : null}

      {activeRepository?.provider === "github" ? (
        <form action={unlinkFormAction} className="mt-4">
          <input type="hidden" name="projectId" value={project.id} />
          <button
            type="submit"
            disabled={unlinkPending}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-60"
          >
            연결 해제
          </button>
        </form>
      ) : null}
      {unlinkState.error ? (
        <p className="mt-3 text-sm text-danger">{unlinkState.error}</p>
      ) : null}
    </section>
  );
}
