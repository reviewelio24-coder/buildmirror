import { AppError } from "@/lib/errors";
import {
  isGitHubAppConfigured,
  isGitHubOAuthConfigured,
  type GitHubEnvSource,
  type GitHubOAuthConfig,
} from "@/lib/github/config";
import { getInstallStateSecret } from "@/lib/github/install-state";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i;

export function isGitHubAppSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function isGitHubAppInstallReady(
  source: GitHubEnvSource = process.env,
): boolean {
  if (!isGitHubAppConfigured(source) || !isGitHubOAuthConfigured(source)) {
    return false;
  }
  try {
    getInstallStateSecret(source);
  } catch {
    return false;
  }
  return isGitHubAppSlug(source.GITHUB_APP_SLUG?.trim() ?? "");
}

export function buildGitHubUserAuthorizeUrl(
  oauth: GitHubOAuthConfig,
  state: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", oauth.userCallbackUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export function buildGitHubInstallUrl(slug: string, state: string): string {
  if (!isGitHubAppSlug(slug)) {
    throw new AppError({
      userMessage: "GitHub App이 아직 설정되지 않았습니다.",
      developerCause: "GITHUB_APP_SLUG is missing or invalid",
      code: "GITHUB_APP_NOT_CONFIGURED",
      status: 501,
    });
  }
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}
