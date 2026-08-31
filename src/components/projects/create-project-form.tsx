"use client";

import { useActionState } from "react";
import { createProjectAction, type ActionState } from "@/app/actions";

const initial: ActionState = { error: null };

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, initial);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        프로젝트 이름
        <input
          name="name"
          required
          maxLength={80}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
          placeholder="포트폴리오 블로그"
        />
      </label>
      <label className="text-sm">
        기본 브랜치
        <input
          name="defaultBranch"
          defaultValue="main"
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono"
        />
      </label>
      <label className="text-sm">
        저장소 owner
        <input
          name="repositoryOwner"
          required
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono"
          placeholder="demo-user"
        />
      </label>
      <label className="text-sm">
        저장소 name
        <input
          name="repositoryName"
          required
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono"
          placeholder="my-app"
        />
      </label>
      {state.error ? (
        <p className="sm:col-span-2 text-sm text-danger">{state.error}</p>
      ) : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "만드는 중..." : "프로젝트 만들기"}
        </button>
      </div>
    </form>
  );
}
