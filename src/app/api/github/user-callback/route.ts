import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getGitHubStore } from "@/lib/data/get-github-store";
import { getGitHubAppConfig, getGitHubOAuthConfig } from "@/lib/github/config";
import { getInstallStateSecret } from "@/lib/github/install-state";
import {
  completeGitHubUserCallback,
  githubUserCallbackRedirectPath,
} from "@/lib/github/user-callback";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/projects?github=invalid`);
  }

  try {
    const result = await completeGitHubUserCallback({
      userId: user.id,
      query: {
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        error: url.searchParams.get("error"),
      },
      store: await getGitHubStore(),
      config: getGitHubAppConfig(),
      oauth: getGitHubOAuthConfig(),
      secret: getInstallStateSecret(),
    });
    return NextResponse.redirect(
      `${origin}${githubUserCallbackRedirectPath(result)}`,
    );
  } catch {
    return NextResponse.redirect(`${origin}/projects?github=unavailable`);
  }
}
