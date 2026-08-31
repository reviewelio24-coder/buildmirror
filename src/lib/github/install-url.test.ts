import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  buildGitHubInstallUrl,
  buildGitHubUserAuthorizeUrl,
  isGitHubAppInstallReady,
  isGitHubAppSlug,
} from "@/lib/github/install-url";

describe("GitHub App install URL", () => {
  it("builds the official installations/new URL with state", () => {
    expect(buildGitHubInstallUrl("buildmirror", "abc.def")).toBe(
      "https://github.com/apps/buildmirror/installations/new?state=abc.def",
    );
  });

  it("builds the official user authorization URL", () => {
    expect(
      buildGitHubUserAuthorizeUrl(
        {
          clientId: "Iv1.example",
          clientSecret: "secret",
          userCallbackUrl: "http://localhost:3000/api/github/user-callback",
        },
        "oauth.state",
      ),
    ).toBe(
      "https://github.com/login/oauth/authorize?client_id=Iv1.example&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fgithub%2Fuser-callback&state=oauth.state",
    );
  });

  it("rejects an invalid slug instead of interpolating a free-form host", () => {
    expect(isGitHubAppSlug("buildmirror")).toBe(true);
    expect(isGitHubAppSlug("../evil")).toBe(false);
    expect(() => buildGitHubInstallUrl("https://evil.example", "state")).toThrow(
      AppError,
    );
  });

  it("does not treat mock/CI env as ready for a live install", () => {
    expect(isGitHubAppInstallReady({})).toBe(false);
    expect(
      isGitHubAppInstallReady({
        GITHUB_APP_ID: "1",
        GITHUB_APP_CLIENT_ID: "Iv1.example",
        GITHUB_APP_PRIVATE_KEY: "not-a-key",
        GITHUB_APP_SLUG: "buildmirror",
      }),
    ).toBe(false);
  });
});
