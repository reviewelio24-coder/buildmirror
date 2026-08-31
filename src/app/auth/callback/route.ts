import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMockMode } from "@/lib/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";

  if (isMockMode()) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=auth_callback_failed`,
      );
    }
  }

  // TODO: GitHub OAuth / GitHub App 설치 콜백은 아직 구현하지 않습니다.
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/projects"}`);
}
