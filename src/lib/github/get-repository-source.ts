import { isMockMode } from "@/lib/env";
import { MockGitHubStore } from "@/lib/data/mock-github-store";
import type { GitHubStore } from "@/lib/data/github-store";
import { getGitHubAppConfig } from "@/lib/github/config";
import {
  GitHubApiRepositorySource,
  type InstallationRepositorySource,
} from "@/lib/github/sync-repositories";

export function getInstallationRepositorySource(
  githubStore: GitHubStore,
): InstallationRepositorySource {
  if (isMockMode() && githubStore instanceof MockGitHubStore) {
    return {
      list: async (installation) => githubStore.getCatalog(installation.id),
    };
  }
  return new GitHubApiRepositorySource(getGitHubAppConfig());
}
