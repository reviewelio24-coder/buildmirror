import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";

export function createWebhookAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new AppError({
      userMessage: "GitHub webhook을 처리할 수 없습니다.",
      developerCause: "SUPABASE_SERVICE_ROLE_KEY is not configured for webhook processing",
      code: "WEBHOOK_ADMIN_NOT_CONFIGURED",
      status: 503,
    });
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
