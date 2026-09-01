import { NextResponse } from "next/server";
import { getWebhookStore } from "@/lib/data/get-webhook-store";
import { handleGitHubWebhookPost } from "@/lib/github/webhook-request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await handleGitHubWebhookPost(request, {
    getStore: getWebhookStore,
  });
  if (result.logCode) {
    console.error(result.logCode);
  }
  return NextResponse.json(result.body, { status: result.status });
}
