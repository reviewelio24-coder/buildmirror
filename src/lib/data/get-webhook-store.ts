import { isMockMode } from "@/lib/env";
import { getMockGitHubStore } from "@/lib/data/mock-github-store";
import { getMockProjectStore } from "@/lib/data/mock-project-store";
import { MockWebhookStore } from "@/lib/data/mock-webhook-store";
import type { GitHubWebhookStore } from "@/lib/data/webhook-store";
import type { GitHubWebhookDelivery } from "@/lib/types/domain";

type GlobalWebhook = typeof globalThis & {
  __buildMirrorWebhookDeliveries?: GitHubWebhookDelivery[];
};

export async function getWebhookStore(): Promise<GitHubWebhookStore> {
  if (isMockMode()) {
    const github = getMockGitHubStore();
    const projects = await getMockProjectStore();
    const globalStore = globalThis as GlobalWebhook;
    if (!globalStore.__buildMirrorWebhookDeliveries) {
      globalStore.__buildMirrorWebhookDeliveries = [];
    }
    return new MockWebhookStore(
      github.memoryData(),
      projects.memoryData(),
      globalStore.__buildMirrorWebhookDeliveries,
    );
  }
  const { createWebhookAdminClient } = await import(
    "@/lib/supabase/webhook-admin"
  );
  const { SupabaseWebhookStore } = await import(
    "@/lib/data/supabase-webhook-store"
  );
  return new SupabaseWebhookStore(createWebhookAdminClient());
}
