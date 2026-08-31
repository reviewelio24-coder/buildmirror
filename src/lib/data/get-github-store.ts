import { isMockMode } from "@/lib/env";
import { getMockGitHubStore } from "@/lib/data/mock-github-store";
import { SupabaseGitHubStore } from "@/lib/data/supabase-github-store";
import type { GitHubStore } from "@/lib/data/github-store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getGitHubStore(): Promise<GitHubStore> {
  if (isMockMode()) {
    return getMockGitHubStore();
  }
  const supabase = await createServerSupabaseClient();
  return new SupabaseGitHubStore(supabase);
}
