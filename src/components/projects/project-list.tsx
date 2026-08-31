"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, shortSha } from "@/lib/format";
import type { ProjectSummary } from "@/lib/types/domain";

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"active" | "archived">("active");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return projects.filter((item) => {
      const archived = Boolean(item.project.archivedAt);
      if (visibility === "active" && archived) {
        return false;
      }
      if (visibility === "archived" && !archived) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const haystack = [
        item.project.name,
        item.repository?.owner,
        item.repository?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [projects, query, visibility]);

  const recent = [...projects]
    .filter((item) => !item.project.archivedAt)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">새 프로젝트</h2>
        <p className="mt-1 text-sm text-muted">
          GitHub App은 아직 연결되지 않습니다. mock owner와 name으로 프로젝트를
          만들 수 있습니다.
        </p>
        <div className="mt-4">
          <CreateProjectForm />
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">프로젝트</h2>
            <p className="text-sm text-muted">
              최근 사용 순으로 표시됩니다. 검색은 이름과 저장소에 적용됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트 또는 저장소 검색"
              className="w-64 rounded border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setVisibility("active")}
              className={`rounded border px-3 py-2 text-sm ${
                visibility === "active"
                  ? "border-accent bg-accent text-white"
                  : "border-border"
              }`}
            >
              활성
            </button>
            <button
              type="button"
              onClick={() => setVisibility("archived")}
              className={`rounded border px-3 py-2 text-sm ${
                visibility === "archived"
                  ? "border-accent bg-accent text-white"
                  : "border-border"
              }`}
            >
              보관
            </button>
          </div>
        </div>

        {visibility === "active" && query.trim() === "" && recent.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-muted">최근 사용</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map((item) => (
                <Link
                  key={item.project.id}
                  href={`/projects/${item.project.id}`}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-sm"
                >
                  {item.project.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                projects.length === 0
                  ? "아직 프로젝트가 없습니다"
                  : visibility === "archived"
                    ? "보관된 프로젝트가 없습니다"
                    : "검색 결과가 없습니다"
              }
              description={
                projects.length === 0
                  ? "위에서 mock 저장소 정보로 첫 프로젝트를 만드세요."
                  : "다른 검색어나 활성/보관 필터를 확인해 보세요."
              }
            />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
            {filtered.map((item) => (
              <li key={item.project.id}>
                <Link
                  href={`/projects/${item.project.id}`}
                  className="flex flex-col gap-3 px-4 py-4 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{item.project.name}</p>
                    <p className="font-mono text-sm text-muted">
                      {item.repository
                        ? `${item.repository.owner}/${item.repository.name}`
                        : "저장소 없음"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      저장 SHA {shortSha(item.project.storedCommitSha)} · 확인 SHA{" "}
                      {shortSha(item.project.latestKnownCommitSha)} · 최근 열람{" "}
                      {formatDateTime(item.project.lastOpenedAt)}
                    </p>
                  </div>
                  <StatusBadge status={item.project.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
