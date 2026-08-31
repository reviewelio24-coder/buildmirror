import { describe, expect, it } from "vitest";
import {
  createGitHubWebhookSignature,
  verifyGitHubWebhookSignature,
} from "@/lib/github/webhook-signature";

const SECRET = "It's a Secret to Everybody";
const PAYLOAD = Buffer.from("Hello, World!");
const OFFICIAL = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

describe("GitHub webhook signature", () => {
  it("matches GitHub's official HMAC SHA-256 test vector", () => {
    expect(createGitHubWebhookSignature(SECRET, PAYLOAD)).toBe(OFFICIAL);
    expect(
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: OFFICIAL,
      }),
    ).toBe(true);
  });

  it("rejects a missing, malformed, or wrong signature", () => {
    expect(
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: null,
      }),
    ).toBe(false);
    expect(
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: "sha1=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
      }),
    ).toBe(false);
    expect(
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: "sha256=deadbeef",
      }),
    ).toBe(false);
    expect(
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: `${OFFICIAL}00`,
      }),
    ).toBe(false);
  });

  it("does not throw when signature lengths differ", () => {
    expect(() =>
      verifyGitHubWebhookSignature({
        secret: SECRET,
        rawBody: PAYLOAD,
        signatureHeader: "sha256=ab",
      }),
    ).not.toThrow();
  });
});
