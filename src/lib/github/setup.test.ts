import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { isGitHubAppConfigured, isGitHubWebhookConfigured } from "@/lib/github/config";
import type { GitHubAppConfig, GitHubOAuthConfig } from "@/lib/github/config";
import { createInstallState } from "@/lib/github/install-state";
import { isGitHubAppInstallReady } from "@/lib/github/install-url";
import {
  completeGitHubSetup,
  GITHUB_SETUP_ERROR_COPY,
  githubConnectedRedirectPath,
  githubInstallationUiStatus,
  githubSetupFailRedirectPath,
  parseGitHubSetupError,
} from "@/lib/github/setup";
import { DEMO_USER_ID } from "@/lib/ids";
import { createDemoStoreData } from "@/lib/mock/seed";

const SECRET = "buildmirror-install-state-secret";
const NOW = new Date("2026-08-31T12:00:00.000Z");

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

const githubInstallationBody = {
  id: 4242,
  app_id: 123,
  account: {
    login: "octocat",
    id: 99,
    type: "User",
  },
  repository_selection: "selected",
  permissions: { contents: "read", metadata: "read" },
  events: ["push"],
  created_at: "2026-08-31T01:00:00Z",
  suspended_at: null,
};

function okFetch(body: unknown = githubInstallationBody, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

async function primedState(userId: string, returnTo: unknown = "/projects") {
  const store = createMemoryGitHubStore();
  const { state, payload } = createInstallState({
    userId,
    returnTo,
    secret: SECRET,
    now: NOW,
  });
  await store.createInstallNonce(
    userId,
    payload.nonce,
    new Date(payload.exp * 1000).toISOString(),
  );
  return { store, state, payload };
}

describe("GitHub Setup URL completion", () => {
  it("does not persist an installation from Setup URL alone", async () => {
    const { store, state } = await primedState(DEMO_USER_ID);
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "4242",
        setup_action: "install",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authorizeUrl.startsWith("https://github.com/login/oauth/authorize?")).toBe(
        true,
      );
      expect(result.authorizeUrl).toContain("client_id=Iv1.example");
      expect(result.authorizeUrl).not.toContain("ghu_");
    }
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    const claim = await store.findOpenInstallClaim(
      DEMO_USER_ID,
      4242,
      NOW.toISOString(),
    );
    expect(claim?.githubExternalInstallationId).toBe(4242);
    expect(claim?.returnTo).toBe("/projects");
  });

  it("blocks a reused state that did not finish installing", async () => {
    const { store, state, payload } = await primedState(DEMO_USER_ID);
    await store.consumeInstallNonce(
      DEMO_USER_ID,
      payload.nonce,
      NOW.toISOString(),
    );
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: { installation_id: "4242", setup_action: "install", state },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(),
    });
    expect(result).toEqual({
      ok: false,
      code: "invalid",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
  });

  it("does not persist a partial installation when GitHub API lookup fails", async () => {
    const { store, state } = await primedState(DEMO_USER_ID);
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "4242",
        setup_action: "install",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(
        { message: "Not Found", documentation_url: "https://docs.github.com" },
        404,
      ),
    });
    expect(result).toEqual({
      ok: false,
      code: "unavailable",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    expect(
      await store.findOpenInstallClaim(DEMO_USER_ID, 4242, NOW.toISOString()),
    ).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Not Found");
    expect(JSON.stringify(result)).not.toContain("documentation_url");
    expect(JSON.stringify(result)).not.toContain(config.privateKey.slice(0, 20));
  });

  it("rejects a bad installation id before calling GitHub", async () => {
    const { store, state } = await primedState(DEMO_USER_ID);
    let called = false;
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "0",
        setup_action: "install",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });
    expect(called).toBe(false);
    expect(result).toEqual({
      ok: false,
      code: "invalid",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
  });

  it("keeps org approval-pending setup_action as pending approval", async () => {
    const { store, state } = await primedState(DEMO_USER_ID);
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "4242",
        setup_action: "request",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(),
    });
    expect(result).toEqual({
      ok: false,
      code: "pending_approval",
      returnTo: "/projects",
    });
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    const afterApproval = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "4242",
        setup_action: "update",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(),
    });
    expect(afterApproval.ok).toBe(true);
    expect(await store.listInstallations(DEMO_USER_ID)).toEqual([]);
    expect(
      await store.findOpenInstallClaim(DEMO_USER_ID, 4242, NOW.toISOString()),
    ).not.toBeNull();
  });

  it("never uses an external or protocol-relative returnTo", async () => {
    const { store, state } = await primedState(DEMO_USER_ID, "//evil.example");
    const result = await completeGitHubSetup({
      userId: DEMO_USER_ID,
      query: {
        installation_id: "4242",
        setup_action: "install",
        state,
      },
      store,
      config,
      oauth,
      secret: SECRET,
      now: NOW,
      fetchImpl: okFetch(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.returnTo).toBe("/projects");
      expect(result.authorizeUrl.startsWith("https://github.com/login/oauth/authorize?")).toBe(
        true,
      );
      expect(result.authorizeUrl).not.toContain("evil.example");
    }
    const claim = await store.findOpenInstallClaim(
      DEMO_USER_ID,
      4242,
      NOW.toISOString(),
    );
    expect(claim?.returnTo).toBe("/projects");
    expect(githubConnectedRedirectPath("//evil.example")).toBe(
      "/projects?github=connected",
    );
    expect(githubSetupFailRedirectPath("invalid")).toBe("/projects?github=invalid");
  });
});

describe("GitHub setup UI status and copy", () => {
  it("shows only the allowed failure messages", () => {
    expect(GITHUB_SETUP_ERROR_COPY.cancelled).toBe("설치가 취소되었습니다.");
    expect(GITHUB_SETUP_ERROR_COPY.expired).toBe("설치 요청이 만료되었습니다.");
    expect(GITHUB_SETUP_ERROR_COPY.invalid).toBe("유효하지 않은 설치 요청입니다.");
    expect(GITHUB_SETUP_ERROR_COPY.already_linked).toBe(
      "이미 다른 계정에 연결된 설치입니다.",
    );
    expect(GITHUB_SETUP_ERROR_COPY.unavailable).toBe(
      "GitHub 설치 정보를 확인하지 못했습니다.",
    );
    expect(GITHUB_SETUP_ERROR_COPY.pending_approval).toBe(
      "조직 관리자 승인을 기다리고 있습니다.",
    );
    expect(parseGitHubSetupError("connected")).toBeNull();
    expect(parseGitHubSetupError("BEGIN PRIVATE KEY")).toBeNull();
  });

  it("classifies connected, suspended, deleted, and permission error states", () => {
    expect(
      githubInstallationUiStatus({
        suspendedAt: null,
        permissions: { contents: "read" },
      }),
    ).toBe("connected");
    expect(
      githubInstallationUiStatus({
        suspendedAt: "2026-08-31T12:00:00.000Z",
        permissions: { contents: "read" },
      }),
    ).toBe("suspended");
    expect(
      githubInstallationUiStatus({
        suspendedAt: null,
        deletedAt: "2026-08-31T12:00:00.000Z",
        permissions: { contents: "read" },
      }),
    ).toBe("deleted");
    expect(
      githubInstallationUiStatus({
        suspendedAt: null,
        permissions: { metadata: "read" },
      }),
    ).toBe("permission_error");
  });

  it("keeps mock mode usable without GitHub App env", async () => {
    expect(isGitHubAppConfigured({})).toBe(false);
    expect(isGitHubAppInstallReady({})).toBe(false);
    expect(isGitHubWebhookConfigured({})).toBe(false);
    const githubStore = createMemoryGitHubStore();
    expect(await githubStore.listInstallations(DEMO_USER_ID)).toEqual([]);
    const projects = await createMemoryProjectStore(
      createDemoStoreData(),
    ).listProjectSummaries(DEMO_USER_ID, { visibility: "all" });
    expect(projects.length).toBeGreaterThan(0);
  });
});
