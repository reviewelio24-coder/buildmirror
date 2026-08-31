import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getGitHubStore } from "@/lib/data/get-github-store";
import { getGitHubAppConfig, getGitHubOAuthConfig } from "@/lib/github/config";
import { getInstallStateSecret } from "@/lib/github/install-state";
import {
  completeGitHubSetup,
  githubSetupFailRedirectPath,
} from "@/lib/github/setup";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/projects?github=invalid`);
  }

  try {
    const result = await completeGitHubSetup({
      userId: user.id,
      query: {
        installation_id: url.searchParams.get("installation_id"),
        setup_action: url.searchParams.get("setup_action"),
        state: url.searchParams.get("state"),
      },
      store: await getGitHubStore(),
      config: getGitHubAppConfig(),
      oauth: getGitHubOAuthConfig(),
      secret: getInstallStateSecret(),
    });
    if (result.ok) {
      return NextResponse.redirect(result.authorizeUrl);
    }
    return NextResponse.redirect(`${origin}${githubSetupFailRedirectPath(result.code)}`);
  } catch {
    return NextResponse.redirect(`${origin}/projects?github=unavailable`);
  }
}
