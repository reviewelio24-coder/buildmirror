import { AppError } from "@/lib/errors";
import { createAppJwt } from "@/lib/github/app-auth";
import {
  GITHUB_API_BASE_URL,
  GITHUB_API_VERSION,
  type GitHubAppConfig,
  type GitHubOAuthConfig,
} from "@/lib/github/config";
import {
  githubAccountTypeSchema,
  githubInstallationApiSchema,
  githubInstallationRepositoriesApiSchema,
  githubInstallationTokenApiSchema,
  githubRepositoryApiSchema,
  githubUserAccessTokenApiSchema,
  githubUserInstallationsApiSchema,
  type GitHubInstallationAccessToken,
  type GitHubInstallationApi,
  type MappedGitHubInstallation,
  type MappedGitHubRepository,
} from "@/lib/github/types";

type FetchLike = typeof fetch;

function githubHeaders(authorization: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${authorization}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "BuildMirror",
  };
}

export function mapGitHubInstallation(
  raw: GitHubInstallationApi,
): MappedGitHubInstallation {
  const parsed = githubInstallationApiSchema.parse(raw);
  if (!parsed.account) {
    throw new AppError({
      userMessage: "GitHub App 설치 계정 정보를 확인하지 못했습니다.",
      developerCause: "installation.account is null",
      code: "GITHUB_INSTALLATION_ACCOUNT_MISSING",
      status: 502,
    });
  }
  const accountType = githubAccountTypeSchema.catch("User").parse(
    parsed.account.type === "Organization" ? "Organization" : "User",
  );
  return {
    githubExternalInstallationId: parsed.id,
    accountLogin: parsed.account.login,
    accountType,
    accountId: parsed.account.id,
    repositorySelection: parsed.repository_selection,
    permissions: parsed.permissions,
    events: parsed.events,
    installedAt: parsed.created_at,
    suspendedAt: parsed.suspended_at ?? null,
  };
}

export function mapGitHubRepository(
  raw: unknown,
): MappedGitHubRepository {
  const parsed = githubRepositoryApiSchema.parse(raw);
  return {
    githubRepositoryId: parsed.id,
    owner: parsed.owner.login,
    name: parsed.name,
    fullName: parsed.full_name,
    defaultBranch: parsed.default_branch,
    htmlUrl: parsed.html_url,
    isPrivate: parsed.private,
    isArchived: parsed.archived,
    isDisabled: parsed.disabled,
    permissions: parsed.permissions,
    githubPushedAt: parsed.pushed_at ?? null,
  };
}

export async function createInstallationAccessToken(
  config: GitHubAppConfig,
  githubInstallationId: number,
  options: { fetchImpl?: FetchLike; now?: Date } = {},
): Promise<GitHubInstallationAccessToken> {
  const { token } = createAppJwt(config, options.now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${GITHUB_API_BASE_URL}/app/installations/${githubInstallationId}/access_tokens`,
    {
      method: "POST",
      headers: githubHeaders(token),
    },
  );
  if (!response.ok) {
    throw new AppError({
      userMessage: "GitHub 설치 토큰을 발급하지 못했습니다.",
      developerCause: `GitHub installation token request failed with status ${response.status}`,
      code: "GITHUB_INSTALLATION_TOKEN_FAILED",
      status: 502,
    });
  }
  const parsed = githubInstallationTokenApiSchema.parse(await response.json());
  return {
    token: parsed.token,
    expiresAt: parsed.expires_at,
    permissions: parsed.permissions ?? {},
    repositorySelection: parsed.repository_selection ?? null,
  };
}

export async function fetchInstallation(
  config: GitHubAppConfig,
  githubInstallationId: number,
  options: { fetchImpl?: FetchLike; now?: Date } = {},
): Promise<MappedGitHubInstallation> {
  const { token } = createAppJwt(config, options.now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${GITHUB_API_BASE_URL}/app/installations/${githubInstallationId}`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) {
    throw new AppError({
      userMessage: "GitHub App 설치 정보를 불러오지 못했습니다.",
      developerCause: `GitHub installation fetch failed with status ${response.status}`,
      code: "GITHUB_INSTALLATION_FETCH_FAILED",
      status: 502,
    });
  }
  return mapGitHubInstallation(
    githubInstallationApiSchema.parse(await response.json()),
  );
}

export async function fetchInstallationRepositories(
  accessToken: GitHubInstallationAccessToken,
  options: { fetchImpl?: FetchLike } = {},
): Promise<MappedGitHubRepository[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const collected: MappedGitHubRepository[] = [];
  let nextUrl: string | null =
    `${GITHUB_API_BASE_URL}/installation/repositories?per_page=100`;

  while (nextUrl) {
    const response = await fetchImpl(nextUrl, {
      headers: githubHeaders(accessToken.token),
    });
    if (!response.ok) {
      throw new AppError({
        userMessage: "GitHub 저장소 목록을 불러오지 못했습니다.",
        developerCause: `GitHub repository list failed with status ${response.status}`,
        code: "GITHUB_REPOSITORY_LIST_FAILED",
        status: 502,
      });
    }
    const parsed = githubInstallationRepositoriesApiSchema.parse(
      await response.json(),
    );
    for (const item of parsed.repositories) {
      collected.push(mapGitHubRepository(item));
    }
    const header = response.headers.get("link") ?? response.headers.get("Link");
    nextUrl = nextLinkFromHeader(header);
  }

  return collected;
}

function nextLinkFromHeader(header: string | null): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/i.exec(part);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export async function exchangeGitHubUserCode(
  oauth: GitHubOAuthConfig,
  code: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "BuildMirror",
    },
    body: JSON.stringify({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      code,
      redirect_uri: oauth.userCallbackUrl,
    }),
  });
  if (!response.ok) {
    throw new AppError({
      userMessage: "GitHub 사용자 승인을 확인하지 못했습니다.",
      developerCause: `GitHub user code exchange failed with status ${response.status}`,
      code: "GITHUB_USER_TOKEN_EXCHANGE_FAILED",
      status: 502,
    });
  }
  const parsed = githubUserAccessTokenApiSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AppError({
      userMessage: "GitHub 사용자 승인을 확인하지 못했습니다.",
      developerCause: "GitHub user code exchange returned an invalid payload",
      code: "GITHUB_USER_TOKEN_EXCHANGE_FAILED",
      status: 502,
    });
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
  };
}

export async function findUserOwnedInstallation(
  accessToken: string,
  input: { installationId: number; appId: string },
  options: { fetchImpl?: FetchLike } = {},
): Promise<MappedGitHubInstallation | "missing" | "suspended"> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let nextUrl: string | null =
    `${GITHUB_API_BASE_URL}/user/installations?per_page=100`;
  const expectedAppId = Number(input.appId);
  while (nextUrl) {
    const response = await fetchImpl(nextUrl, {
      headers: githubHeaders(accessToken),
    });
    if (!response.ok) {
      throw new AppError({
        userMessage: "GitHub 설치 정보를 확인하지 못했습니다.",
        developerCause: `GitHub user installations list failed with status ${response.status}`,
        code: "GITHUB_USER_INSTALLATIONS_FAILED",
        status: 502,
      });
    }
    const parsed = githubUserInstallationsApiSchema.parse(await response.json());
    const match = parsed.installations.find(
      (item) => item.id === input.installationId,
    );
    if (match) {
      if (match.app_id !== expectedAppId) {
        return "missing";
      }
      if (match.suspended_at) {
        return "suspended";
      }
      return mapGitHubInstallation(match);
    }
    const header = response.headers.get("link") ?? response.headers.get("Link");
    nextUrl = nextLinkFromHeader(header);
  }
  return "missing";
}

export async function revokeGitHubUserToken(
  oauth: GitHubOAuthConfig,
  tokens: { accessToken: string; refreshToken: string | null },
  options: { fetchImpl?: FetchLike } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const basic = Buffer.from(
    `${oauth.clientId}:${oauth.clientSecret}`,
    "utf8",
  ).toString("base64");
  const response = await fetchImpl(
    `${GITHUB_API_BASE_URL}/applications/${oauth.clientId}/token`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${basic}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "BuildMirror",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokens.accessToken }),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new AppError({
      userMessage: "GitHub 설치 정보를 확인하지 못했습니다.",
      developerCause: `GitHub user token revoke failed with status ${response.status}`,
      code: "GITHUB_USER_TOKEN_REVOKE_FAILED",
      status: 502,
    });
  }
  if (!tokens.refreshToken) {
    return;
  }
  const refreshResponse = await fetchImpl(`${GITHUB_API_BASE_URL}/credentials/revoke`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "BuildMirror",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ credentials: [tokens.refreshToken] }),
  });
  if (!refreshResponse.ok && refreshResponse.status !== 422) {
    throw new AppError({
      userMessage: "GitHub 설치 정보를 확인하지 못했습니다.",
      developerCause: `GitHub refresh token revoke failed with status ${refreshResponse.status}`,
      code: "GITHUB_USER_TOKEN_REVOKE_FAILED",
      status: 502,
    });
  }
}
