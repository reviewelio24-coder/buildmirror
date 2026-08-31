import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { createMemoryWebhookStore } from "@/lib/data/mock-webhook-store";
import { createEmptyStoreData } from "@/lib/mock/seed";
import {
  GITHUB_WEBHOOK_MAX_BODY_BYTES,
  readRawBodyWithLimit,
  receiveGitHubWebhook,
} from "@/lib/github/webhook-http";
import { createGitHubWebhookSignature } from "@/lib/github/webhook-signature";

const SECRET = "It's a Secret to Everybody";
const DELIVERY = "11111111-1111-4111-8111-111111111111";

function store() {
  const github = createMemoryGitHubStore();
  const projects = createMemoryProjectStore(createEmptyStoreData());
  return createMemoryWebhookStore({
    github: github.memoryData(),
    projects: projects.memoryData(),
  });
}

function signedHeaders(raw: Buffer, extra?: Record<string, string>) {
  return new Headers({
    "content-type": "application/json",
    "x-hub-signature-256": createGitHubWebhookSignature(SECRET, raw),
    "x-github-delivery": DELIVERY,
    "x-github-event": "ping",
    ...extra,
  });
}

describe("GitHub webhook HTTP checks", () => {
  it("verifies the signature before JSON parsing", async () => {
    const parseJson = vi.fn(() => {
      throw new Error("should not parse");
    });
    const rawBody = Buffer.from("{not json");
    const result = await receiveGitHubWebhook({
      headers: new Headers({
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=deadbeef",
        "x-github-delivery": DELIVERY,
        "x-github-event": "ping",
      }),
      rawBody,
      secret: SECRET,
      store: store(),
      parseJson,
    });
    expect(result).toEqual({ status: 401, code: "INVALID_SIGNATURE" });
    expect(parseJson).not.toHaveBeenCalled();
  });

  it("parses JSON only after a valid signature", async () => {
    const parseJson = vi.fn((text: string) => JSON.parse(text) as unknown);
    const rawBody = Buffer.from(JSON.stringify({ zen: "ok" }));
    await receiveGitHubWebhook({
      headers: signedHeaders(rawBody),
      rawBody,
      secret: SECRET,
      store: store(),
      parseJson,
    });
    expect(parseJson).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or different-length signature", async () => {
    const rawBody = Buffer.from(JSON.stringify({ zen: "ok" }));
    const webhookStore = store();
    expect(
      await receiveGitHubWebhook({
        headers: new Headers({
          "content-type": "application/json",
          "x-github-delivery": DELIVERY,
          "x-github-event": "ping",
        }),
        rawBody,
        secret: SECRET,
        store: webhookStore,
      }),
    ).toEqual({ status: 400, code: "MISSING_WEBHOOK_HEADERS" });

    expect(
      await receiveGitHubWebhook({
        headers: signedHeaders(rawBody, {
          "x-hub-signature-256": "sha256=ab",
        }),
        rawBody,
        secret: SECRET,
        store: webhookStore,
      }),
    ).toEqual({ status: 401, code: "INVALID_SIGNATURE" });
  });

  it("rejects missing headers, bad content type, and oversized payloads", async () => {
    const rawBody = Buffer.from(JSON.stringify({ zen: "ok" }));
    const webhookStore = store();
    expect(
      await receiveGitHubWebhook({
        headers: signedHeaders(rawBody, { "content-type": "text/plain" }),
        rawBody,
        secret: SECRET,
        store: webhookStore,
      }),
    ).toEqual({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });

    expect(
      await receiveGitHubWebhook({
        headers: signedHeaders(rawBody, {
          "content-type": "application/json; charset=utf-8",
        }),
        rawBody,
        secret: SECRET,
        store: webhookStore,
      }),
    ).toEqual({ status: 200, code: "PROCESSED" });

    const huge = Buffer.from(`{"x":"${"a".repeat(GITHUB_WEBHOOK_MAX_BODY_BYTES)}"}`);
    expect(
      await receiveGitHubWebhook({
        headers: signedHeaders(huge),
        rawBody: huge,
        secret: SECRET,
        store: webhookStore,
      }),
    ).toEqual({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("stops reading a stream once the payload limit is exceeded", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(GITHUB_WEBHOOK_MAX_BODY_BYTES + 1));
        controller.close();
      },
    });
    expect(await readRawBodyWithLimit(oversized)).toEqual({
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("ignores events outside the allowlist after a valid signature", async () => {
    const rawBody = Buffer.from(JSON.stringify({ action: "opened" }));
    const webhookStore = store();
    const result = await receiveGitHubWebhook({
      headers: signedHeaders(rawBody, { "x-github-event": "issues" }),
      rawBody,
      secret: SECRET,
      store: webhookStore,
    });
    expect(result).toEqual({ status: 200, code: "EVENT_IGNORED" });
    expect(await webhookStore.getDelivery(DELIVERY)).toBeNull();
  });

  it("records ping without storing the payload or secret", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({ zen: "Responsive is better than fast." }),
    );
    const webhookStore = store();
    const result = await receiveGitHubWebhook({
      headers: signedHeaders(rawBody),
      rawBody,
      secret: SECRET,
      store: webhookStore,
    });
    expect(result).toEqual({ status: 200, code: "PROCESSED" });
    const delivery = await webhookStore.getDelivery(DELIVERY);
    expect(delivery?.githubEvent).toBe("ping");
    expect(JSON.stringify(delivery)).not.toContain(SECRET);
    expect(JSON.stringify(delivery)).not.toContain("Responsive is better than fast");
  });

  it("fails closed without a webhook secret", async () => {
    const rawBody = Buffer.from("{}");
    expect(
      await receiveGitHubWebhook({
        headers: signedHeaders(rawBody),
        rawBody,
        secret: null,
        store: store(),
      }),
    ).toEqual({ status: 503, code: "GITHUB_WEBHOOK_SECRET_MISSING" });
  });

  it("keeps webhook-admin isolated to the server module", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/webhook-admin.ts"),
      "utf8",
    );
    expect(source).toContain("server-only");
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const githubStore = readFileSync(
      path.join(process.cwd(), "src/lib/data/get-github-store.ts"),
      "utf8",
    );
    expect(githubStore).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(githubStore).not.toContain("webhook-admin");
  });
});
