import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import type { GitHubAppConfig, GitHubOAuthConfig } from "@/lib/github/config";
import {
  createInstallState,
  createUserOAuthState,
  INSTALL_STATE_TTL_MS,
} from "@/lib/github/install-state";
import { completeGitHubSetup } from "@/lib/github/setup";
import { completeGitHubUserCallback } from "@/lib/github/user-callback";
import { DEMO_USER_ID } from "@/lib/ids";

const SECRET = "buildmirror-install-state-secret";
const NOW = new Date("2026-08-31T12:00:00.000Z");
const USER_B = "00000000-0000-0000-0000-00000000000b";
const ACCESS_TOKEN = "ghu_test_access_token_value";
const REFRESH_TOKEN = "ghr_test_refresh_token_value";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const config: GitHubAppConfig = {
  appId: "123",
  clientId: "Iv1.example",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  slug: "buildmirror",
};

const oauth: GitHubOAuthConfig = {
  clientId: "Iv1.example",
  clientSecret: "github-app-client-secret-value",
  userCallbackUrl: "http://localhost:3000/api/github/user-callback",
};

const installationPayload = {
  id: 4242,
  app_id: 123,
  account: {
    login: "octocat",
    id: 99,
    type: "User",
  },
  repository_selection: "selected" as const,
  permissions: { contents: "read", metadata: "read" },
  events: ["push"],
  created_at: "2026-08-31T01:00:00Z",
  suspended_at: null,
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function githubFetchMock(options: {
  tokenStatus?: number;
  tokenBody?: unknown;
  installationsPages?: unknown[];
  revokeStatus?: number;
  capture?: { revoked?: unknown; urls: string[] };
}): typeof fetch {
  const pages = options.installationsPages ?? [
    { total_count: 1, installations: [installationPayload] },
  ];
  return async (input, init) => {
    const url = String(input);
    options.capture?.urls.push(url);
    if (url === "https://github.com/login/oauth/access_token") {
      if ((options.tokenStatus ?? 200) !== 200) {
        return jsonResponse({ error: "bad_verification_code" }, options.tokenStatus);
      }
      return jsonResponse(
        options.tokenBody ?? {
          access_token: ACCESS_TOKEN,
          token_type: "bearer",
          scope: "",
          refresh_token: REFRESH_TOKEN,
        },
      );
    }
    if (url.includes("/applications/") && url.endsWith("/token")) {
      if (init?.body && options.capture) {
        options.capture.revoked = JSON.parse(String(init.body));
      }
      return new Response(null, { status: options.revokeStatus ?? 204 });
    }
    if (url.includes("/credentials/revoke")) {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/user/installations")) {
      const current = new URL(url);
      const page = Number(current.searchParams.get("page") ?? "1");
      const index = Number.isFinite(page) && page > 0 ? page - 1 : 0;
      const body = pages[index] ?? { total_count: 0, installations: [] };
      const headers: Record<string, string> = {};
      if (index < pages.length - 1) {
        const next = new URL(url);
        next.searchParams.set("page", String(index + 2));
        headers.Link = `<${next.toString()}>; rel="next"`;
      }
      return jsonResponse(body, 200, headers);
    }
    if (url.includes("/app/installations/")) {
      return jsonResponse(installationPayload);
    }
    return jsonResponse({ message: "missing mock" }, 404);
  };
}

async function primedSetup(userId = DEMO_USER_ID, installationId = "4242") {
  const store = createMemoryGitHubStore();
  const install = createInstallState({
    userId,
    returnTo: "/projects",
    secret: SECRET,
    now: NOW,
  });
  await store.createInstallNonce(
    userId,
    install.payload.nonce,
    new Date(install.payload.exp * 1000).toISOString(),
  );
  const setup = await completeGitHubSetup({
    userId,
    query: {
      installation_id: installationId,
      setup_action: "install",
      state: install.state,
    },
    store,
    config,
    oauth,
    secret: SECRET,
    now: NOW,
    fetchImpl: githubFetchMock({}),
  });
  const claim = await store.findOpenInstallClaim(
    userId,
    Number(installationId),
    NOW.toISOString(),
  );
  const oauthState = createUserOAuthState({
    userId,
    returnTo: "/projects",
    secret: SECRET,
    now: NOW,
    nonce: claim?.nonce,
  });
  return { store, setup, claim, oauthState };
}

describe("GitHub user callback ownership proof", () => {
  it("connects the installation after a valid user callback", async () => {
    const { store, oauthState } = await primedSetup();
    const capture = { urls: [] as string[], revoked: undefined as unknown };
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({ capture }),
    });
    expect(result).toEqual({ ok: true, returnTo: "/projects" });
    const saved = await store.listInstallations(DEMO_USER_ID);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      githubExternalInstallationId: 4242,
      accountLogin: "octocat",
      accountType: "User",
      accountId: 99,
    });
    expect(JSON.stringify(saved)).not.toContain("ghu_");
    expect(JSON.stringify(saved)).not.toContain("ghr_");
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(capture.urls.some((url) => url.includes("/applications/"))).toBe(true);
    expect(capture.revoked).toEqual({ access_token: ACCESS_TOKEN });
  });

  it("uses GitHub API account fields instead of client-supplied account data", async () => {
    const { store, oauthState } = await primedSetup();
    await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: {
        code: "github-user-code-1",
        state: oauthState.state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({
        installationsPages: [
          {
            total_count: 1,
            installations: [
              {
                ...installationPayload,
                account: { login: "real-org", id: 77, type: "Organization" },
              },
            ],
          },
        ],
      }),
    });
    const saved = await store.listInstallations(DEMO_USER_ID);
    expect(saved[0]?.accountLogin).toBe("real-org");
    expect(saved[0]?.accountType).toBe("Organization");
    expect(saved[0]?.accountId).toBe(77);
  });

  it("blocks an installation that is not in /user/installations", async () => {
    const { store, oauthState } = await primedSetup();
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({
        installationsPages: [{ total_count: 1, installations: [] }],
      }),
    });
    expect(result).toEqual({
      ok: false,
      code: "invalid",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
  });

  it("finds the installation on a later /user/installations page", async () => {
    const { store, oauthState } = await primedSetup();
    const filler = { ...installationPayload, id: 1001 };
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({
        installationsPages: [
          { total_count: 2, installations: [filler] },
          { total_count: 2, installations: [installationPayload] },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    expect(await store.listInstallations(DEMO_USER_ID)).toHaveLength(1);
  });

  it("does not create an installation when code exchange fails", async () => {
    const { store, oauthState } = await primedSetup();
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({ tokenStatus: 401 }),
    });
    expect(result).toEqual({
      ok: false,
      code: "unavailable",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("bad_verification_code");
  });

  it("blocks another user from injecting a GitHub installation id", async () => {
    const owner = await primedSetup(DEMO_USER_ID);
    await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: owner.oauthState.state },
      store: owner.store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    const otherInstall = createInstallState({
      userId: USER_B,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    await owner.store.createInstallNonce(
      USER_B,
      otherInstall.payload.nonce,
      new Date(otherInstall.payload.exp * 1000).toISOString(),
    );
    const otherSetup = await completeGitHubSetup({
      userId: USER_B,
      query: {
        installation_id: "4242",
        setup_action: "install",
        state: otherInstall.state,
      },
      store: owner.store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    expect(otherSetup.ok).toBe(true);
    const otherClaim = await owner.store.findOpenInstallClaim(
      USER_B,
      4242,
      NOW.toISOString(),
    );
    const otherOauth = createUserOAuthState({
      userId: USER_B,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
      nonce: otherClaim?.nonce,
    });
    const result = await completeGitHubUserCallback({
      userId: USER_B,
      query: { code: "github-user-code-2", state: otherOauth.state },
      store: owner.store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    expect(result).toEqual({
      ok: false,
      code: "already_linked",
      returnTo: "/projects",
    });
    expect(await owner.store.listInstallations(USER_B)).toEqual([]);
  });

  it("rejects tampered, expired, and reused OAuth state", async () => {
    const { store, oauthState } = await primedSetup();
    const tampered = `${oauthState.state.slice(0, -2)}aa`;
    expect(
      await completeGitHubUserCallback({
        userId: DEMO_USER_ID,
        query: { code: "github-user-code-1", state: tampered },
        store,
        config,
        oauth,
        secret: SECRET,
        now: NOW,
        fetchImpl: githubFetchMock({}),
      }),
    ).toMatchObject({ ok: false, code: "invalid" });

    const expired = createUserOAuthState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
      nonce: oauthState.payload.nonce,
    });
    expect(
      await completeGitHubUserCallback({
        userId: DEMO_USER_ID,
        query: { code: "github-user-code-1", state: expired.state },
        store,
        config,
        oauth,
        secret: SECRET,
        now: new Date(NOW.getTime() + INSTALL_STATE_TTL_MS + 1000),
        fetchImpl: githubFetchMock({}),
      }),
    ).toMatchObject({ ok: false, code: "expired" });

    const first = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    expect(first.ok).toBe(true);
    const reused = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    expect(reused.ok).toBe(true);
    expect(await store.listInstallations(DEMO_USER_ID)).toHaveLength(1);
  });

  it("blocks another Supabase user from consuming the callback", async () => {
    const { store, oauthState } = await primedSetup(DEMO_USER_ID);
    const result = await completeGitHubUserCallback({
      userId: USER_B,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({}),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    expect(await store.listInstallations(USER_B)).toEqual([]);
  });

  it("does not expose secrets when token revoke fails", async () => {
    const { store, oauthState } = await primedSetup();
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({ revokeStatus: 500 }),
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(result)).not.toContain(oauth.clientSecret);
    expect(await store.listInstallations(DEMO_USER_ID)).toHaveLength(1);
  });

  it("blocks a wrong-app installation even if the numeric id matches", async () => {
    const { store, oauthState } = await primedSetup();
    const result = await completeGitHubUserCallback({
      userId: DEMO_USER_ID,
      query: { code: "github-user-code-1", state: oauthState.state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: githubFetchMock({
        installationsPages: [
          {
            total_count: 1,
            installations: [{ ...installationPayload, app_id: 999 }],
          },
        ],
      }),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
  });
});
