import { describe, expect, it, vi } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { createMemoryWebhookStore } from "@/lib/data/mock-webhook-store";
import { createEmptyStoreData } from "@/lib/mock/seed";
import { handleGitHubWebhookPost } from "@/lib/github/webhook-request";
import {
  WEBHOOK_UNAVAILABLE_PUBLIC_CODE,
  inspectWebhookRuntime,
} from "@/lib/github/webhook-runtime";
import { createGitHubWebhookSignature } from "@/lib/github/webhook-signature";

const SECRET = "It's a Secret to Everybody";
const SERVICE_ROLE = "sb-service-role-test-value-not-real";
const DELIVERY = "11111111-1111-4111-8111-111111111111";

function memoryStore() {
  const github = createMemoryGitHubStore();
  const projects = createMemoryProjectStore(createEmptyStoreData());
  return createMemoryWebhookStore({
    github: github.memoryData(),
    projects: projects.memoryData(),
  });
}

function signedRequest(raw: string, extra?: Record<string, string>) {
  const buffer = Buffer.from(raw);
  return new Request("http://localhost/api/github/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": createGitHubWebhookSignature(SECRET, buffer),
      "x-github-delivery": DELIVERY,
      "x-github-event": "ping",
      ...extra,
    },
    body: raw,
  });
}

function assertSafePublicBody(body: { ok: boolean; code: string }) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("GITHUB_WEBHOOK_SECRET");
  expect(serialized).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(serialized).not.toContain(SECRET);
  expect(serialized).not.toContain(SERVICE_ROLE);
  expect(serialized).not.toMatch(/at\s+\S+\s+\(/);
}

describe("webhook runtime readiness", () => {
  it("fails closed when the webhook secret is missing", () => {
    expect(inspectWebhookRuntime({ APP_DATA_MODE: "mock" })).toEqual({
      ready: false,
      code: "GITHUB_WEBHOOK_SECRET_MISSING",
    });
  });

  it("fails closed in supabase mode without a service role", () => {
    expect(
      inspectWebhookRuntime({
        APP_DATA_MODE: "supabase",
        GITHUB_WEBHOOK_SECRET: SECRET,
      }),
    ).toEqual({
      ready: false,
      code: "WEBHOOK_ADMIN_NOT_CONFIGURED",
    });
  });

  it("is ready in mock mode with only a webhook secret", () => {
    expect(
      inspectWebhookRuntime({
        APP_DATA_MODE: "mock",
        GITHUB_WEBHOOK_SECRET: SECRET,
      }),
    ).toEqual({ ready: true, secret: SECRET });
  });

  it("is ready in supabase mode with secret and service role", () => {
    expect(
      inspectWebhookRuntime({
        APP_DATA_MODE: "supabase",
        GITHUB_WEBHOOK_SECRET: SECRET,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
      }),
    ).toEqual({ ready: true, secret: SECRET });
  });
});

describe("webhook request fail-closed gate", () => {
  it("returns 503 without calling the store when the secret is missing", async () => {
    const getStore = vi.fn();
    const result = await handleGitHubWebhookPost(signedRequest("{}"), {
      env: { APP_DATA_MODE: "mock" },
      getStore,
    });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      ok: false,
      code: WEBHOOK_UNAVAILABLE_PUBLIC_CODE,
    });
    expect(result.logCode).toBe("GITHUB_WEBHOOK_SECRET_MISSING");
    expect(getStore).not.toHaveBeenCalled();
    assertSafePublicBody(result.body);
    expect(result.logCode).not.toContain(SECRET);
  });

  it("returns 503 without calling the store when supabase service role is missing", async () => {
    const getStore = vi.fn();
    const result = await handleGitHubWebhookPost(signedRequest("{}"), {
      env: {
        APP_DATA_MODE: "supabase",
        GITHUB_WEBHOOK_SECRET: SECRET,
      },
      getStore,
    });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      ok: false,
      code: WEBHOOK_UNAVAILABLE_PUBLIC_CODE,
    });
    expect(result.logCode).toBe("WEBHOOK_ADMIN_NOT_CONFIGURED");
    expect(getStore).not.toHaveBeenCalled();
    assertSafePublicBody(result.body);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SERVICE_ROLE);
    expect(JSON.stringify(result)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the existing signed ping flow when runtime is configured", async () => {
    const store = memoryStore();
    const getStore = vi.fn(async () => store);
    const result = await handleGitHubWebhookPost(
      signedRequest(JSON.stringify({ zen: "ok" })),
      {
        env: {
          APP_DATA_MODE: "mock",
          GITHUB_WEBHOOK_SECRET: SECRET,
        },
        getStore,
      },
    );
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 200,
      body: { ok: true, code: "PROCESSED" },
    });
    expect(await store.getDelivery(DELIVERY)).toMatchObject({
      githubEvent: "ping",
    });
  });
});
