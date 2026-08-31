"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_COOKIE_NAME } from "@/lib/auth/constants";
import { DEMO_USER_ID } from "@/lib/ids";
import { requireUser } from "@/lib/auth/session";
import { getProjectStore } from "@/lib/data/get-project-store";
import { isMockMode } from "@/lib/env";
import { toUserErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createProjectSchema,
  deleteProjectSchema,
  renameProjectSchema,
} from "@/lib/validation/project";
import type { AnalysisJobType } from "@/lib/types/domain";

export type ActionState = {
  error: string | null;
};

export async function startDemoSessionFromForm(formData: FormData): Promise<void> {
  const next = String(formData.get("next") ?? "/projects");
  await startDemoSession(next);
}

export async function startDemoSession(nextPath?: string): Promise<void> {
  if (!isMockMode()) {
    redirect("/login");
  }
  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE_NAME, DEMO_USER_ID, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(nextPath && nextPath.startsWith("/") ? nextPath : "/projects");
}

export async function signOut(): Promise<void> {
  if (isMockMode()) {
    const cookieStore = await cookies();
    cookieStore.delete(DEMO_COOKIE_NAME);
  } else {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = createProjectSchema.safeParse({
      name: formData.get("name"),
      repositoryOwner: formData.get("repositoryOwner"),
      repositoryName: formData.get("repositoryName"),
      defaultBranch: formData.get("defaultBranch") || "main",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
    }
    const store = await getProjectStore();
    const project = await store.createProject(user.id, parsed.data);
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: toUserErrorMessage(error) };
  }
}

export async function renameProjectAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = renameProjectSchema.safeParse({
      name: formData.get("name"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
    }
    const store = await getProjectStore();
    await store.updateProjectName(user.id, projectId, parsed.data.name);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);
    return { error: null };
  } catch (error) {
    return { error: toUserErrorMessage(error) };
  }
}

export async function archiveProjectAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const store = await getProjectStore();
  await store.archiveProject(user.id, projectId);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
}

export async function reactivateProjectAction(projectId: string): Promise<void> {
  const user = await requireUser();
  const store = await getProjectStore();
  await store.reactivateProject(user.id, projectId);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
}

export async function deleteProjectAction(
  projectId: string,
  expectedName: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = deleteProjectSchema.safeParse({
      confirmName: formData.get("confirmName"),
    });
    if (!parsed.success || parsed.data.confirmName !== expectedName) {
      return { error: "삭제하려면 프로젝트 이름을 정확히 입력하세요." };
    }
    const store = await getProjectStore();
    const project = await store.getProject(user.id, projectId);
    if (project.name !== expectedName) {
      return { error: "프로젝트 소유권을 다시 확인하지 못했습니다." };
    }
    await store.deleteProject(user.id, projectId);
    revalidatePath("/projects");
    redirect("/projects");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: toUserErrorMessage(error) };
  }
}

export async function switchProjectAction(input: {
  fromProjectId: string;
  toProjectId: string;
  route: string;
  snapshotId: string | null;
  filters: Record<string, string>;
}): Promise<void> {
  const user = await requireUser();
  const store = await getProjectStore();
  if (input.fromProjectId !== input.toProjectId) {
    await store.saveViewState(user.id, input.fromProjectId, {
      route: input.route,
      snapshotId: input.snapshotId,
      filters: input.filters,
    });
  }
  const nextState = await store.getViewState(user.id, input.toProjectId);
  const homeRoute = `/projects/${input.toProjectId}`;
  let nextRoute = nextState?.route || homeRoute;
  const isHome =
    nextRoute === homeRoute || nextRoute === `${homeRoute}/`;
  if (isHome && nextState?.snapshotId) {
    nextRoute = `${homeRoute}?snapshot=${nextState.snapshotId}`;
  }
  redirect(nextRoute);
}

export async function enqueueMockAnalysisAction(
  projectId: string,
  type: AnalysisJobType,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const store = await getProjectStore();
    await store.enqueueMockAnalysisJob(user.id, projectId, type);
    revalidatePath(`/projects/${projectId}`);
    return { error: null };
  } catch (error) {
    return { error: toUserErrorMessage(error) };
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
