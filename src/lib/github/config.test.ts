import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createAppJwt } from "@/lib/github/app-auth";
import {
  normalizePrivateKey,
  parseGitHubAppConfig,
  parseGitHubOAuthConfig,
  parseGitHubUserCallbackUrl,
  parseGitHubWebhookSecret,
} from "@/lib/github/config";

function testKeyPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

describe("GitHub App private key normalization", () => {
  it("turns escaped newlines and quotes into a PEM", () => {
    const { privateKey } = testKeyPair();
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const escaped = `"${pem.replace(/\n/g, "\\n")}"`;
    const normalized = normalizePrivateKey(escaped);
    expect(normalized).toContain("BEGIN");
    expect(normalized).toContain("\n");
    expect(normalized).not.toContain("\\n");
    expect(normalized.startsWith('"')).toBe(false);
  });

  it("rejects a value that is not a private key", () => {
    expect(() => normalizePrivateKey("not-a-key")).toThrow(AppError);
    try {
      normalizePrivateKey("not-a-key");
    } catch (error) {
      expect(error).toMatchObject({ code: "GITHUB_APP_PRIVATE_KEY_INVALID" });
    }
  });
});

describe("GitHub App env validation", () => {
  it("lists missing variables without requiring them in mock mode", () => {
    expect(() => parseGitHubAppConfig({})).toThrow(AppError);
    try {
      parseGitHubAppConfig({
        GITHUB_APP_ID: "1",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "GITHUB_APP_NOT_CONFIGURED" });
      expect((error as AppError).developerCause).toContain("GITHUB_APP_CLIENT_ID");
      expect((error as AppError).developerCause).toContain("GITHUB_APP_PRIVATE_KEY");
    }
  });

  it("does not require a webhook secret to parse App config", () => {
    const { privateKey } = testKeyPair();
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() =>
      parseGitHubAppConfig({
        GITHUB_APP_ID: "123",
        GITHUB_APP_CLIENT_ID: "Iv1.example",
        GITHUB_APP_PRIVATE_KEY: pem,
      }),
    ).not.toThrow();
  });

  it("accepts a normalized key from env-style escaped PEM", () => {
    const { privateKey } = testKeyPair();
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const config = parseGitHubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_CLIENT_ID: "Iv1.example",
      GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
      GITHUB_APP_SLUG: "buildmirror",
    });
    expect(config.appId).toBe("123");
    expect(config.clientId).toBe("Iv1.example");
    expect(config.slug).toBe("buildmirror");
    expect(config.privateKey).toContain("BEGIN");
  });
});

describe("GitHub user OAuth env", () => {
  it("accepts a localhost user callback URL and rejects external extras", () => {
    expect(
      parseGitHubUserCallbackUrl("http://localhost:3000/api/github/user-callback"),
    ).toBe("http://localhost:3000/api/github/user-callback");
    expect(parseGitHubUserCallbackUrl("https://evil.example/phish")).toBeNull();
    expect(parseGitHubUserCallbackUrl("//evil.example")).toBeNull();
    const parsed = parseGitHubOAuthConfig({
      GITHUB_APP_CLIENT_ID: "Iv1.example",
      GITHUB_APP_CLIENT_SECRET: "client-secret-value",
      GITHUB_USER_CALLBACK_URL: "http://localhost:3000/api/github/user-callback",
    });
    expect(parsed.userCallbackUrl).toBe(
      "http://localhost:3000/api/github/user-callback",
    );
  });
});

describe("GitHub App JWT", () => {
  it("signs RS256 claims with the app client id as issuer", () => {
    const { privateKey, publicKey } = testKeyPair();
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = new Date("2026-08-31T00:00:00.000Z");
    const { token, claims } = createAppJwt(
      {
        appId: "123",
        clientId: "Iv1.example",
        privateKey: pem,
        slug: null,
      },
      now,
    );
    expect(claims.iss).toBe("Iv1.example");
    expect(claims.exp - claims.iat).toBe(660);
    const [header, payload, signature] = token.split(".");
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature ?? "", "base64url"),
      ),
    ).toBe(true);
  });
});

describe("GitHub webhook secret", () => {
  it("fails closed when the secret is missing or too short", () => {
    expect(() => parseGitHubWebhookSecret({})).toThrow(AppError);
    expect(() => parseGitHubWebhookSecret({ GITHUB_WEBHOOK_SECRET: "short" })).toThrow(
      AppError,
    );
    try {
      parseGitHubWebhookSecret({});
    } catch (error) {
      expect(error).toMatchObject({ code: "GITHUB_WEBHOOK_SECRET_MISSING" });
    }
  });

  it("accepts a sufficiently long secret", () => {
    expect(
      parseGitHubWebhookSecret({
        GITHUB_WEBHOOK_SECRET: "It's a Secret to Everybody",
      }),
    ).toBe("It's a Secret to Everybody");
  });
});
