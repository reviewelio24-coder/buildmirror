import { isMockMode } from "@/lib/env";
import { getMockProjectStore } from "@/lib/data/mock-project-store";
import { SupabaseProjectStore } from "@/lib/data/supabase-project-store";
import type { ProjectStore } from "@/lib/data/project-store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getProjectStore(): Promise<ProjectStore> {
  if (isMockMode()) {
    return getMockProjectStore();
  }
  const supabase = await createServerSupabaseClient();
  return new SupabaseProjectStore(supabase);
}
