import type { GitHubWebhookStore } from "@/lib/data/webhook-store";
import {
  GITHUB_WEBHOOK_MAX_BODY_BYTES,
  readRawBodyWithLimit,
  receiveGitHubWebhook,
} from "@/lib/github/webhook-http";
import {
  WEBHOOK_UNAVAILABLE_PUBLIC_CODE,
  inspectWebhookRuntime,
  type WebhookRuntimeCode,
  type WebhookRuntimeSource,
} from "@/lib/github/webhook-runtime";

export type GitHubWebhookPostResult = {
  status: number;
  body: { ok: boolean; code: string };
  logCode?: WebhookRuntimeCode;
};

export async function handleGitHubWebhookPost(
  request: Request,
  options: {
    env?: WebhookRuntimeSource;
    getStore: () => Promise<GitHubWebhookStore>;
  },
): Promise<GitHubWebhookPostResult> {
  const runtime = inspectWebhookRuntime(options.env ?? process.env);
  if (!runtime.ready) {
    return {
      status: 503,
      body: { ok: false, code: WEBHOOK_UNAVAILABLE_PUBLIC_CODE },
      logCode: runtime.code,
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > GITHUB_WEBHOOK_MAX_BODY_BYTES
  ) {
    return {
      status: 413,
      body: { ok: false, code: "PAYLOAD_TOO_LARGE" },
    };
  }

  const body = await readRawBodyWithLimit(request.body);
  if (!body.ok) {
    return {
      status: 413,
      body: { ok: false, code: body.code },
    };
  }

  const result = await receiveGitHubWebhook({
    headers: request.headers,
    rawBody: body.rawBody,
    secret: runtime.secret,
    store: await options.getStore(),
  });

  return {
    status: result.status,
    body: { ok: result.status < 400, code: result.code },
  };
}
