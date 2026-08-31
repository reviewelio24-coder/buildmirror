import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { requireUser } from "@/lib/auth/session";
import { getProjectStore } from "@/lib/data/get-project-store";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const store = await getProjectStore();
  const projects = await store.listProjectSummaries(user.id, {
    visibility: "all",
  });
  const current = projects.find((item) => item.project.id === projectId);
  if (!current) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted">현재 보고 있는 프로젝트</p>
          <h1 className="text-lg font-semibold">{current.project.name}</h1>
          <p className="font-mono text-sm text-muted">
            {current.repository
              ? `${current.repository.owner}/${current.repository.name}`
              : "저장소 없음"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${projectId}`}
            className="rounded border border-border px-3 py-1.5 text-sm"
          >
            홈
          </Link>
          <Link
            href={`/projects/${projectId}/settings`}
            className="rounded border border-border px-3 py-1.5 text-sm"
          >
            설정
          </Link>
          <Link href="/projects" className="rounded border border-border px-3 py-1.5 text-sm">
            목록
          </Link>
          <Suspense fallback={<div className="h-10 w-56 rounded border border-border" />}>
            <ProjectSwitcher currentProjectId={projectId} projects={projects} />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}
