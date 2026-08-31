import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import type { SessionUser } from "@/lib/types/domain";

export function AppHeader({
  user,
  currentProjectName,
  children,
}: {
  user: SessionUser;
  currentProjectName?: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/projects" className="shrink-0 font-semibold tracking-tight">
            BuildMirror
          </Link>
          {currentProjectName ? (
            <p className="truncate text-sm text-muted">
              현재 프로젝트:{" "}
              <span className="font-medium text-foreground">
                {currentProjectName}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {children}
          <p className="text-sm text-muted">{user.displayName}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
