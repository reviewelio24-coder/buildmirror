import type { GitHubStore } from "@/lib/data/github-store";
import { fetchInstallation } from "@/lib/github/client";
import type { GitHubAppConfig, GitHubOAuthConfig } from "@/lib/github/config";
import {
  createUserOAuthState,
  parseGitHubInstallationId,
  parseSetupAction,
  verifyInstallState,
} from "@/lib/github/install-state";
import { buildGitHubUserAuthorizeUrl } from "@/lib/github/install-url";
import { sanitizeNextPath } from "@/lib/navigation/paths";

export const GITHUB_SETUP_ERROR_CODES = [
  "cancelled",
  "expired",
  "invalid",
  "already_linked",
  "unavailable",
  "pending_approval",
] as const;

export type GitHubSetupErrorCode = (typeof GITHUB_SETUP_ERROR_CODES)[number];

export const GITHUB_SETUP_ERROR_COPY: Record<GitHubSetupErrorCode, string> = {
  cancelled: "설치가 취소되었습니다.",
  expired: "설치 요청이 만료되었습니다.",
  invalid: "유효하지 않은 설치 요청입니다.",
  already_linked: "이미 다른 계정에 연결된 설치입니다.",
  unavailable: "GitHub 설치 정보를 확인하지 못했습니다.",
  pending_approval: "조직 관리자 승인을 기다리고 있습니다.",
};

export type GitHubSetupQuery = {
  installation_id?: string | null;
  setup_action?: string | null;
  state?: string | null;
};

export type GitHubSetupOk = {
  ok: true;
  authorizeUrl: string;
  returnTo: string;
};

export type GitHubSetupFail = {
  ok: false;
  code: GitHubSetupErrorCode;
  returnTo: "/projects";
};

export type GitHubSetupResult = GitHubSetupOk | GitHubSetupFail;

function fail(code: GitHubSetupErrorCode): GitHubSetupFail {
  return { ok: false, code, returnTo: "/projects" };
}

export function parseGitHubSetupError(raw: unknown): GitHubSetupErrorCode | null {
  if (typeof raw !== "string") {
    return null;
  }
  return (GITHUB_SETUP_ERROR_CODES as readonly string[]).includes(raw)
    ? (raw as GitHubSetupErrorCode)
    : null;
}

async function authorizeFromClaim(input: {
  userId: string;
  oauth: GitHubOAuthConfig;
  secret: string;
  now: Date;
  claimNonce: string;
  returnTo: string;
}): Promise<GitHubSetupOk> {
  const oauthState = createUserOAuthState({
    userId: input.userId,
    returnTo: input.returnTo,
    secret: input.secret,
    now: input.now,
    nonce: input.claimNonce,
  });
  return {
    ok: true,
    authorizeUrl: buildGitHubUserAuthorizeUrl(input.oauth, oauthState.state),
    returnTo: sanitizeNextPath(input.returnTo),
  };
}

export async function completeGitHubSetup(input: {
  userId: string;
  query: GitHubSetupQuery;
  store: GitHubStore;
  config: GitHubAppConfig;
  oauth: GitHubOAuthConfig;
  secret: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<GitHubSetupResult> {
  const now = input.now ?? new Date();
  const setupAction = parseSetupAction(input.query.setup_action);
  if (!setupAction) {
    return fail("invalid");
  }
  if (setupAction === "request") {
    return fail("pending_approval");
  }

  const verified = verifyInstallState(input.query.state, {
    secret: input.secret,
    userId: input.userId,
    now,
  });
  if ("error" in verified) {
    if (verified.error === "expired") {
      return fail("expired");
    }
    return fail("invalid");
  }

  const installationId = parseGitHubInstallationId(input.query.installation_id);
  if (!installationId) {
    return fail("invalid");
  }

  const nonceResult = await input.store.consumeInstallNonce(
    input.userId,
    verified.nonce,
    now.toISOString(),
  );
  if (nonceResult === "expired") {
    return fail("expired");
  }
  if (nonceResult === "missing") {
    return fail("invalid");
  }
  if (nonceResult === "reused") {
    const open = await input.store.findOpenInstallClaim(
      input.userId,
      installationId,
      now.toISOString(),
    );
    if (!open) {
      return fail("invalid");
    }
    return authorizeFromClaim({
      userId: input.userId,
      oauth: input.oauth,
      secret: input.secret,
      now,
      claimNonce: open.nonce,
      returnTo: open.returnTo,
    });
  }

  try {
    const remote = await fetchInstallation(input.config, installationId, {
      fetchImpl: input.fetchImpl,
      now,
    });
    if (remote.suspendedAt) {
      return fail("unavailable");
    }
  } catch {
    return fail("unavailable");
  }

  const oauthState = createUserOAuthState({
    userId: input.userId,
    returnTo: verified.returnTo,
    secret: input.secret,
    now,
  });
  await input.store.createInstallClaim({
    userId: input.userId,
    nonce: oauthState.payload.nonce,
    githubExternalInstallationId: installationId,
    returnTo: sanitizeNextPath(verified.returnTo),
    expiresAt: new Date(oauthState.payload.exp * 1000).toISOString(),
    createdAt: now.toISOString(),
  });

  return {
    ok: true,
    authorizeUrl: buildGitHubUserAuthorizeUrl(input.oauth, oauthState.state),
    returnTo: sanitizeNextPath(verified.returnTo),
  };
}

export function githubSetupFailRedirectPath(code: GitHubSetupErrorCode): string {
  return `/projects?github=${code}`;
}

export function githubConnectedRedirectPath(returnTo: string): string {
  const base = sanitizeNextPath(returnTo);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}github=connected`;
}

export function githubInstallationUiStatus(
  installation: {
    suspendedAt: string | null;
    deletedAt?: string | null;
    permissions: Record<string, string>;
  },
): "connected" | "suspended" | "permission_error" | "deleted" {
  if (installation.deletedAt) {
    return "deleted";
  }
  if (installation.suspendedAt) {
    return "suspended";
  }
  const contents = installation.permissions.contents;
  if (contents !== "read" && contents !== "write") {
    return "permission_error";
  }
  return "connected";
}
