"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_COOKIE_NAME } from "@/lib/auth/constants";
import { DEMO_USER_ID } from "@/lib/ids";
import { requireUser } from "@/lib/auth/session";
import { getGitHubStore } from "@/lib/data/get-github-store";
import { getProjectStore } from "@/lib/data/get-project-store";
import { isMockMode } from "@/lib/env";
import { toUserErrorMessage } from "@/lib/errors";
import { getGitHubAppConfig, getGitHubOAuthConfig } from "@/lib/github/config";
import { getInstallationRepositorySource } from "@/lib/github/get-repository-source";
import { createInstallState, getInstallStateSecret } from "@/lib/github/install-state";
import { buildGitHubInstallUrl, isGitHubAppSlug } from "@/lib/github/install-url";
import { isUuid, sanitizeNextPath } from "@/lib/navigation/paths";
import {
  linkProjectGitHubRepository,
  unlinkProjectGitHubRepository,
} from "@/lib/projects/link-repository";
import { resolveSwitchRedirect } from "@/lib/projects/switch-project";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { linkGitHubRepositorySchema } from "@/lib/validation/github-repository";
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
  redirect(sanitizeNextPath(nextPath));
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
  const fallback = resolveSwitchRedirect({
    toProjectId: input.toProjectId,
    toOwned: false,
    savedRoute: null,
    savedSnapshotId: null,
    snapshotBelongsToTarget: false,
  });

  let toOwned = false;
  try {
    if (isUuid(input.toProjectId)) {
      await store.getProject(user.id, input.toProjectId);
      toOwned = true;
    }
  } catch {
    redirect(fallback);
  }

  if (!toOwned) {
    redirect(fallback);
  }

  if (input.fromProjectId !== input.toProjectId && isUuid(input.fromProjectId)) {
    try {
      await store.getProject(user.id, input.fromProjectId);
      await store.saveViewState(user.id, input.fromProjectId, {
        route: input.route,
        snapshotId: input.snapshotId,
        filters: input.filters,
      });
    } catch {
      // Keep switching even if the source project cannot be saved.
    }
  }

  try {
    await store.markProjectOpened(user.id, input.toProjectId);
  } catch {
    // last_opened_at is best-effort and must not block navigation.
  }

  let savedRoute: string | null = null;
  let savedSnapshotId: string | null = null;
  let snapshotBelongsToTarget = false;
  try {
    const nextState = await store.getViewState(user.id, input.toProjectId);
    savedRoute = nextState?.route ?? null;
    savedSnapshotId = nextState?.snapshotId ?? null;
    const dashboard = await store.getDashboard(
      user.id,
      input.toProjectId,
      savedSnapshotId,
    );
    snapshotBelongsToTarget = Boolean(savedSnapshotId) && !dashboard.invalidSnapshotRequested;
  } catch {
    redirect(fallback);
  }

  redirect(
    resolveSwitchRedirect({
      toProjectId: input.toProjectId,
      toOwned: true,
      savedRoute,
      savedSnapshotId,
      snapshotBelongsToTarget,
    }),
  );
}

export async function enqueueMockAnalysisAction(
  projectId: string,
  type: AnalysisJobType,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const store = await getProjectStore();
    const dashboard = await store.getDashboard(user.id, projectId);
    if (dashboard.repository?.isDisabled) {
      return { error: "비활성화된 저장소는 분석을 시작할 수 없습니다." };
    }
    if (dashboard.repository?.connectionStatus === "inaccessible") {
      return {
        error: "접근 권한이 없는 저장소는 분석을 시작할 수 없습니다.",
      };
    }
    await store.enqueueMockAnalysisJob(user.id, projectId, type);
    revalidatePath(`/projects/${projectId}`);
    return { error: null };
  } catch (error) {
    return { error: toUserErrorMessage(error) };
  }
}

export async function linkGitHubRepositoryAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = linkGitHubRepositorySchema.safeParse({
      installationId: formData.get("installationId"),
      githubRepositoryId: formData.get("githubRepositoryId"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
    }
    const projectStore = await getProjectStore();
    const githubStore = await getGitHubStore();
    await linkProjectGitHubRepository({
      userId: user.id,
      projectId,
      installationId: parsed.data.installationId,
      githubRepositoryId: parsed.data.githubRepositoryId,
      projectStore,
      githubStore,
      source: getInstallationRepositorySource(githubStore),
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);
    return { error: null };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: toUserErrorMessage(error) };
  }
}

export async function unlinkGitHubRepositoryAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (String(formData.get("projectId") ?? "") !== projectId) {
      return { error: "프로젝트 소유권을 다시 확인하지 못했습니다." };
    }
    const projectStore = await getProjectStore();
    await unlinkProjectGitHubRepository({
      userId: user.id,
      projectId,
      projectStore,
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);
    return { error: null };
  } catch (error) {
    return { error: toUserErrorMessage(error) };
  }
}

export async function startGitHubInstallAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = sanitizeNextPath(formData.get("returnTo"));
  try {
    const config = getGitHubAppConfig();
    if (!config.slug || !isGitHubAppSlug(config.slug)) {
      redirect("/projects?github=unavailable");
    }
    getGitHubOAuthConfig();
    const secret = getInstallStateSecret();
    const store = await getGitHubStore();
    const { state, payload } = createInstallState({
      userId: user.id,
      returnTo,
      secret,
    });
    await store.createInstallNonce(
      user.id,
      payload.nonce,
      new Date(payload.exp * 1000).toISOString(),
    );
    redirect(buildGitHubInstallUrl(config.slug, state));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect("/projects?github=unavailable");
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
