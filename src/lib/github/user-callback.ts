import { AppError } from "@/lib/errors";
import type { GitHubStore } from "@/lib/data/github-store";
import {
  exchangeGitHubUserCode,
  findUserOwnedInstallation,
  revokeGitHubUserToken,
} from "@/lib/github/client";
import type { GitHubAppConfig, GitHubOAuthConfig } from "@/lib/github/config";
import { verifyUserOAuthState } from "@/lib/github/install-state";
import { sanitizeNextPath } from "@/lib/navigation/paths";
import type { GitHubSetupErrorCode, GitHubSetupFail } from "@/lib/github/setup";
import { githubConnectedRedirectPath } from "@/lib/github/setup";

export type GitHubUserCallbackQuery = {
  code?: string | null;
  state?: string | null;
  error?: string | null;
};

export type GitHubUserCallbackOk = {
  ok: true;
  returnTo: string;
};

export type GitHubUserCallbackResult = GitHubUserCallbackOk | GitHubSetupFail;

function fail(code: GitHubSetupErrorCode): GitHubSetupFail {
  return { ok: false, code, returnTo: "/projects" };
}

function parseAuthorizationCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const code = raw.trim();
  if (code.length < 8 || code.length > 512 || !/^[A-Za-z0-9._-]+$/.test(code)) {
    return null;
  }
  return code;
}

export function githubUserCallbackRedirectPath(
  result: GitHubUserCallbackResult,
): string {
  if (result.ok) {
    return githubConnectedRedirectPath(result.returnTo);
  }
  return `/projects?github=${result.code}`;
}

export async function completeGitHubUserCallback(input: {
  userId: string;
  query: GitHubUserCallbackQuery;
  store: GitHubStore;
  config: GitHubAppConfig;
  oauth: GitHubOAuthConfig;
  secret: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<GitHubUserCallbackResult> {
  const now = input.now ?? new Date();
  if (input.query.error === "access_denied") {
    return fail("cancelled");
  }
  if (input.query.error) {
    return fail("invalid");
  }

  const verified = verifyUserOAuthState(input.query.state, {
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

  const code = parseAuthorizationCode(input.query.code);
  if (!code) {
    return fail("invalid");
  }

  const nonceResult = await input.store.consumeInstallClaim(
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

  const claim = await input.store.getInstallClaim(input.userId, verified.nonce);
  if (!claim || claim.userId !== input.userId) {
    return fail("invalid");
  }

  if (nonceResult === "reused") {
    const existing = await input.store.getInstallationByExternalId(
      input.userId,
      claim.githubExternalInstallationId,
    );
    if (existing) {
      return {
        ok: true,
        returnTo: sanitizeNextPath(claim.returnTo),
      };
    }
    return fail("invalid");
  }

  let tokens: { accessToken: string; refreshToken: string | null } | null = null;
  try {
    tokens = await exchangeGitHubUserCode(input.oauth, code, {
      fetchImpl: input.fetchImpl,
    });
    const owned = await findUserOwnedInstallation(
      tokens.accessToken,
      {
        installationId: claim.githubExternalInstallationId,
        appId: input.config.appId,
      },
      { fetchImpl: input.fetchImpl },
    );
    if (owned === "missing") {
      return fail("invalid");
    }
    if (owned === "suspended") {
      return fail("unavailable");
    }
    await input.store.upsertInstallation(input.userId, {
      githubExternalInstallationId: owned.githubExternalInstallationId,
      accountLogin: owned.accountLogin,
      accountType: owned.accountType,
      accountId: owned.accountId,
      repositorySelection: owned.repositorySelection,
      permissions: owned.permissions,
      events: owned.events,
      installedAt: owned.installedAt,
      suspendedAt: owned.suspendedAt,
      lastSyncedAt: now.toISOString(),
    });
    return {
      ok: true,
      returnTo: sanitizeNextPath(claim.returnTo),
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "GITHUB_INSTALLATION_ALREADY_LINKED") {
      return fail("already_linked");
    }
    return fail("unavailable");
  } finally {
    if (tokens) {
      try {
        await revokeGitHubUserToken(input.oauth, tokens, {
          fetchImpl: input.fetchImpl,
        });
      } catch {
        // Token is not stored. Do not include GitHub token or secret in errors.
      }
    }
  }
}
