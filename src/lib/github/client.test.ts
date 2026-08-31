import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInstallationAccessToken,
  fetchInstallationRepositories,
  mapGitHubInstallation,
  mapGitHubRepository,
} from "@/lib/github/client";
import type { GitHubAppConfig } from "@/lib/github/config";
import type { GitHubInstallationApi } from "@/lib/github/types";

const sampleInstallation = {
  id: 4242,
  account: {
    login: "demo-user",
    id: 99,
    type: "User",
  },
  repository_selection: "selected",
  permissions: { contents: "read", metadata: "read" },
  events: [],
  created_at: "2026-08-31T01:00:00Z",
  suspended_at: null,
} satisfies GitHubInstallationApi;

const sampleRepository = {
  id: 555001,
  name: "portfolio-blog",
  full_name: "demo-user/portfolio-blog",
  private: true,
  html_url: "https://github.com/demo-user/portfolio-blog",
  default_branch: "main",
  owner: { login: "demo-user" },
  archived: false,
  disabled: false,
  permissions: { pull: true, push: false },
  pushed_at: "2026-08-30T12:00:00Z",
};

function testConfig(): GitHubAppConfig {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "123",
    clientId: "Iv1.example",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    slug: null,
  };
}

describe("GitHub API response mapping", () => {
  it("maps an installation payload to internal fields", () => {
    expect(mapGitHubInstallation(sampleInstallation)).toEqual({
      githubExternalInstallationId: 4242,
      accountLogin: "demo-user",
      accountType: "User",
      accountId: 99,
      repositorySelection: "selected",
      permissions: { contents: "read", metadata: "read" },
      events: [],
      installedAt: "2026-08-31T01:00:00Z",
      suspendedAt: null,
    });
  });

  it("maps a repository payload without keeping clone URLs", () => {
    const mapped = mapGitHubRepository(sampleRepository);
    expect(mapped).toEqual({
      githubRepositoryId: 555001,
      owner: "demo-user",
      name: "portfolio-blog",
      fullName: "demo-user/portfolio-blog",
      defaultBranch: "main",
      htmlUrl: "https://github.com/demo-user/portfolio-blog",
      isPrivate: true,
      isArchived: false,
      isDisabled: false,
      permissions: { pull: "true", push: "false" },
      githubPushedAt: "2026-08-30T12:00:00Z",
    });
    expect(mapped).not.toHaveProperty("cloneUrl");
    expect(mapped).not.toHaveProperty("token");
  });
});

describe("installation access tokens", () => {
  it("reads a token of any length and does not assume 40 characters", async () => {
    const longToken = `ghs_123_${"a".repeat(480)}`;
    const token = await createInstallationAccessToken(testConfig(), 4242, {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            token: longToken,
            expires_at: "2026-08-31T02:00:00Z",
            permissions: { contents: "read" },
            repository_selection: "selected",
          }),
          { status: 200 },
        ),
    });
    expect(token.token).toBe(longToken);
    expect(token.token.length).toBeGreaterThan(40);
    expect(token.expiresAt).toBe("2026-08-31T02:00:00Z");
  });
});

describe("installation repository pagination", () => {
  it("follows Link headers until the last page and omits the token from results", async () => {
    const token = {
      token: "ghs_secret_installation_token",
      expiresAt: "2026-08-31T02:00:00Z",
      permissions: { contents: "read" },
      repositorySelection: "selected" as const,
    };
    const urls: string[] = [];
    const listed = await fetchInstallationRepositories(token, {
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        const page = urls.length;
        const body = {
          total_count: 2,
          repositories: [
            {
              id: page,
              name: page === 1 ? "first" : "second",
              full_name: page === 1 ? "demo-user/first" : "demo-user/second",
              private: false,
              html_url:
                page === 1
                  ? "https://github.com/demo-user/first"
                  : "https://github.com/demo-user/second",
              default_branch: "main",
              owner: { login: "demo-user" },
            },
          ],
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers:
            page === 1
              ? {
                  Link: '<https://api.github.com/installation/repositories?page=2>; rel="next"',
                }
              : {},
        });
      },
    });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("page=2");
    expect(listed.map((item) => item.name)).toEqual(["first", "second"]);
    expect(JSON.stringify(listed)).not.toContain("ghs_secret_installation_token");
  });
});
