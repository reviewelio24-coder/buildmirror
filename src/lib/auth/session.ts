import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE_NAME } from "@/lib/auth/constants";
import { DEMO_USER_EMAIL, DEMO_USER_ID, DEMO_USER_NAME } from "@/lib/ids";
import { isMockMode } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types/domain";

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (isMockMode()) {
    const cookieStore = await cookies();
    const demo = cookieStore.get(DEMO_COOKIE_NAME)?.value;
    if (demo === DEMO_USER_ID) {
      return {
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        displayName: DEMO_USER_NAME,
      };
    }
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email ?? "",
    displayName:
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "사용자",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function assertProjectOwner(userId: string, ownerId: string): void {
  if (userId !== ownerId) {
    throw new AppError({
      userMessage: "프로젝트를 찾을 수 없습니다.",
      developerCause: `Ownership mismatch: session=${userId} owner=${ownerId}`,
      code: "PROJECT_FORBIDDEN",
      status: 404,
    });
  }
}
