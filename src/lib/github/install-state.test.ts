import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInstallState,
  createUserOAuthState,
  getInstallStateSecret,
  INSTALL_STATE_TTL_MS,
  parseGitHubInstallationId,
  parseSetupAction,
  verifyInstallState,
  verifyUserOAuthState,
} from "@/lib/github/install-state";
import { AppError } from "@/lib/errors";
import { DEMO_USER_ID } from "@/lib/ids";

const SECRET = "buildmirror-install-state-secret";
const NOW = new Date("2026-08-31T12:00:00.000Z");
const USER_B = "00000000-0000-0000-0000-00000000000b";

describe("GitHub install state", () => {
  it("accepts a valid signed state for the same user", () => {
    const { state, payload } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    const verified = verifyInstallState(state, {
      secret: SECRET,
      userId: DEMO_USER_ID,
      now: NOW,
    });
    expect(verified).toMatchObject({
      v: 1,
      userId: DEMO_USER_ID,
      nonce: payload.nonce,
      returnTo: "/projects",
    });
  });

  it("rejects a tampered signature", () => {
    const { state } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    const tampered = `${state.slice(0, -2)}aa`;
    expect(
      verifyInstallState(tampered, {
        secret: SECRET,
        userId: DEMO_USER_ID,
        now: NOW,
      }),
    ).toEqual({ error: "invalid" });
  });

  it("rejects an expired state", () => {
    const { state } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    expect(
      verifyInstallState(state, {
        secret: SECRET,
        userId: DEMO_USER_ID,
        now: new Date(NOW.getTime() + INSTALL_STATE_TTL_MS + 1000),
      }),
    ).toEqual({ error: "expired" });
  });

  it("rejects another user's state", () => {
    const { state } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    expect(
      verifyInstallState(state, {
        secret: SECRET,
        userId: USER_B,
        now: NOW,
      }),
    ).toEqual({ error: "wrong_user" });
  });

  it("rewrites protocol-relative and external return paths", () => {
    const { payload } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "//evil.example",
      secret: SECRET,
      now: NOW,
    });
    expect(payload.returnTo).toBe("/projects");

    const encoded = Buffer.from(
      JSON.stringify({
        v: 1,
        purpose: "install",
        userId: DEMO_USER_ID,
        nonce: "11111111-1111-4111-8111-111111111111",
        exp: Math.floor((NOW.getTime() + 60_000) / 1000),
        returnTo: "https://evil.example/phish",
      }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
    const verified = verifyInstallState(`${encoded}.${signature}`, {
      secret: SECRET,
      userId: DEMO_USER_ID,
      now: NOW,
    });
    expect(verified).toMatchObject({ returnTo: "/projects" });
  });

  it("requires an independent state secret of at least 32 characters", () => {
    expect(() => getInstallStateSecret({})).toThrow(AppError);
    expect(() =>
      getInstallStateSecret({ GITHUB_INSTALL_STATE_SECRET: "sixteen-chars-ok" }),
    ).toThrow(AppError);
    expect(
      getInstallStateSecret({
        GITHUB_INSTALL_STATE_SECRET: "buildmirror-install-state-secret",
      }),
    ).toBe("buildmirror-install-state-secret");
  });

  it("does not accept an install state as a user OAuth state", () => {
    const { state } = createInstallState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    expect(
      verifyUserOAuthState(state, {
        secret: SECRET,
        userId: DEMO_USER_ID,
        now: NOW,
      }),
    ).toEqual({ error: "invalid" });
    const oauth = createUserOAuthState({
      userId: DEMO_USER_ID,
      returnTo: "/projects",
      secret: SECRET,
      now: NOW,
    });
    expect(
      verifyInstallState(oauth.state, {
        secret: SECRET,
        userId: DEMO_USER_ID,
        now: NOW,
      }),
    ).toEqual({ error: "invalid" });
  });
});

describe("GitHub installation query parsing", () => {
  it("accepts a safe positive integer installation id", () => {
    expect(parseGitHubInstallationId("4242")).toBe(4242);
    expect(parseGitHubInstallationId(4242)).toBe(4242);
  });

  it("rejects unsafe installation ids", () => {
    expect(parseGitHubInstallationId("0")).toBeNull();
    expect(parseGitHubInstallationId("-1")).toBeNull();
    expect(parseGitHubInstallationId("abc")).toBeNull();
    expect(parseGitHubInstallationId("1.5")).toBeNull();
    expect(parseGitHubInstallationId("9007199254740993")).toBeNull();
    expect(parseGitHubInstallationId("")).toBeNull();
  });

  it("allows install, update, and request setup actions only", () => {
    expect(parseSetupAction("install")).toBe("install");
    expect(parseSetupAction("update")).toBe("update");
    expect(parseSetupAction("request")).toBe("request");
    expect(parseSetupAction("delete")).toBeNull();
  });
});
