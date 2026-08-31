import { NextResponse } from "next/server";
import { getWebhookStore } from "@/lib/data/get-webhook-store";
import {
  getGitHubWebhookSecret,
  isGitHubWebhookConfigured,
} from "@/lib/github/config";
import {
  GITHUB_WEBHOOK_MAX_BODY_BYTES,
  readRawBodyWithLimit,
  receiveGitHubWebhook,
} from "@/lib/github/webhook-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > GITHUB_WEBHOOK_MAX_BODY_BYTES
  ) {
    return NextResponse.json(
      { ok: false, code: "PAYLOAD_TOO_LARGE" },
      { status: 413 },
    );
  }

  const body = await readRawBodyWithLimit(request.body);
  if (!body.ok) {
    return NextResponse.json(
      { ok: false, code: body.code },
      { status: 413 },
    );
  }
  const result = await receiveGitHubWebhook({
    headers: request.headers,
    rawBody: body.rawBody,
    secret: isGitHubWebhookConfigured() ? getGitHubWebhookSecret() : null,
    store: await getWebhookStore(),
  });

  return NextResponse.json(
    { ok: result.status < 400, code: result.code },
    { status: result.status },
  );
}
