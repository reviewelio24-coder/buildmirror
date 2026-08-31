"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { switchProjectAction } from "@/app/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProjectSummary } from "@/lib/types/domain";

export function ProjectSwitcher({
  currentProjectId,
  projects,
}: {
  currentProjectId: string;
  projects: ProjectSummary[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function switchTo(summary: ProjectSummary) {
    startTransition(() => {
      void switchProjectAction({
        fromProjectId: currentProjectId,
        toProjectId: summary.project.id,
        route: pathname,
        snapshotId: searchParams.get("snapshot"),
        filters: Object.fromEntries(searchParams.entries()),
      });
      setOpen(false);
    });
  }

  const current = projects.find((item) => item.project.id === currentProjectId);

  return (
    <div className="relative">
      <button
        type="button"
        className="min-w-56 rounded border border-border bg-background px-3 py-1.5 text-left text-sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="block text-xs text-muted">프로젝트 전환</span>
        <span className="block truncate font-medium">
          {current?.project.name ?? "프로젝트 선택"}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-surface p-2 shadow-sm">
          <p className="px-2 pb-2 text-xs text-muted">
            프로젝트별 분석·점수·알림은 섞이지 않습니다.
          </p>
          <ul className="max-h-80 overflow-auto">
            {projects.map((summary) => (
              <li key={summary.project.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void switchTo(summary)}
                  className="flex w-full items-start justify-between gap-3 rounded px-2 py-2 text-left hover:bg-stone-100"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {summary.project.name}
                    </span>
                    <span className="block font-mono text-xs text-muted">
                      {summary.repository
                        ? `${summary.repository.owner}/${summary.repository.name}`
                        : "저장소 없음"}
                    </span>
                  </span>
                  <StatusBadge status={summary.project.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
