import { AppError } from "@/lib/errors";
import type { GitHubWebhookStore } from "@/lib/data/webhook-store";
import {
  isGitHubWebhookEvent,
  processGitHubWebhookEvent,
} from "@/lib/github/webhook-handler";
import { verifyGitHubWebhookSignature } from "@/lib/github/webhook-signature";

export const GITHUB_WEBHOOK_MAX_BODY_BYTES = 1_048_576;

export type GitHubWebhookHttpResult = {
  status: number;
  code: string;
};

export async function readRawBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number = GITHUB_WEBHOOK_MAX_BODY_BYTES,
): Promise<{ ok: true; rawBody: Buffer } | { ok: false; code: "PAYLOAD_TOO_LARGE" }> {
  if (!body) {
    return { ok: true, rawBody: Buffer.alloc(0) };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, code: "PAYLOAD_TOO_LARGE" };
    }
    chunks.push(value);
  }
  return { ok: true, rawBody: Buffer.concat(chunks) };
}

function headerValue(
  headers: Headers,
  name: string,
): string | null {
  return headers.get(name);
}

export function isJsonContentType(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const media = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return media === "application/json";
}

export function receiveGitHubWebhook(input: {
  headers: Headers;
  rawBody: Buffer;
  secret: string | null;
  store: GitHubWebhookStore;
  parseJson?: (text: string) => unknown;
  now?: Date;
}): Promise<GitHubWebhookHttpResult> {
  return receiveGitHubWebhookAsync(input);
}

async function receiveGitHubWebhookAsync(input: {
  headers: Headers;
  rawBody: Buffer;
  secret: string | null;
  store: GitHubWebhookStore;
  parseJson?: (text: string) => unknown;
  now?: Date;
}): Promise<GitHubWebhookHttpResult> {
  if (!input.secret) {
    return { status: 503, code: "GITHUB_WEBHOOK_SECRET_MISSING" };
  }

  const contentType = headerValue(input.headers, "content-type");
  if (!isJsonContentType(contentType)) {
    return { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" };
  }

  const declaredLength = Number(headerValue(input.headers, "content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > GITHUB_WEBHOOK_MAX_BODY_BYTES
  ) {
    return { status: 413, code: "PAYLOAD_TOO_LARGE" };
  }
  if (input.rawBody.length > GITHUB_WEBHOOK_MAX_BODY_BYTES) {
    return { status: 413, code: "PAYLOAD_TOO_LARGE" };
  }

  const signature = headerValue(input.headers, "x-hub-signature-256");
  const deliveryId = headerValue(input.headers, "x-github-delivery");
  const event = headerValue(input.headers, "x-github-event");
  if (!signature || !deliveryId || !event) {
    return { status: 400, code: "MISSING_WEBHOOK_HEADERS" };
  }
  if (deliveryId.length > 128) {
    return { status: 400, code: "INVALID_DELIVERY_ID" };
  }

  const verified = verifyGitHubWebhookSignature({
    secret: input.secret,
    rawBody: input.rawBody,
    signatureHeader: signature,
  });
  if (!verified) {
    return { status: 401, code: "INVALID_SIGNATURE" };
  }

  if (!isGitHubWebhookEvent(event)) {
    return { status: 200, code: "EVENT_IGNORED" };
  }

  const parseJson = input.parseJson ?? defaultParseJson;
  let payload: unknown;
  try {
    payload = parseJson(input.rawBody.toString("utf8"));
  } catch {
    return { status: 400, code: "INVALID_JSON" };
  }

  const action =
    payload &&
    typeof payload === "object" &&
    "action" in payload &&
    typeof payload.action === "string"
      ? payload.action
      : null;
  const installationId = readNumericId(payload, "installation");
  const repositoryId = readNumericId(payload, "repository");

  const claimed = await input.store.claimDelivery({
    deliveryId,
    event,
    action,
    githubExternalInstallationId: installationId,
    githubRepositoryId: repositoryId,
  });
  if (claimed.kind === "duplicate") {
    return { status: 200, code: "DUPLICATE_DELIVERY" };
  }

  try {
    const outcome = await processGitHubWebhookEvent({
      event,
      deliveryId,
      payload,
      store: input.store,
      now: input.now,
    });
    await input.store.finishDelivery(deliveryId, outcome);
    return { status: 200, code: outcome === "processed" ? "PROCESSED" : "IGNORED" };
  } catch (error) {
    const code =
      error instanceof AppError ? error.code : "WEBHOOK_PROCESSING_FAILED";
    await input.store.finishDelivery(deliveryId, "failed", code);
    return { status: 500, code };
  }
}

function defaultParseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function readNumericId(payload: unknown, key: "installation" | "repository"): number | null {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || !("id" in value)) {
    return null;
  }
  const id = (value as { id: unknown }).id;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}
