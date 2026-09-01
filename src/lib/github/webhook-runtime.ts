import { GITHUB_WEBHOOK_SECRET_MIN_LENGTH } from "@/lib/github/config";

export const WEBHOOK_UNAVAILABLE_PUBLIC_CODE = "WEBHOOK_UNAVAILABLE";

export type WebhookRuntimeSource = {
  APP_DATA_MODE?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  [key: string]: string | undefined;
};

export type WebhookRuntimeCode =
  | "GITHUB_WEBHOOK_SECRET_MISSING"
  | "WEBHOOK_ADMIN_NOT_CONFIGURED";

export type WebhookRuntimeInspection =
  | { ready: true; secret: string }
  | { ready: false; code: WebhookRuntimeCode };

export function inspectWebhookRuntime(
  source: WebhookRuntimeSource,
): WebhookRuntimeInspection {
  const secret = source.GITHUB_WEBHOOK_SECRET?.trim() ?? "";
  if (secret.length < GITHUB_WEBHOOK_SECRET_MIN_LENGTH) {
    return { ready: false, code: "GITHUB_WEBHOOK_SECRET_MISSING" };
  }

  if (source.APP_DATA_MODE === "supabase") {
    const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (!serviceRole) {
      return { ready: false, code: "WEBHOOK_ADMIN_NOT_CONFIGURED" };
    }
  }

  return { ready: true, secret };
}
