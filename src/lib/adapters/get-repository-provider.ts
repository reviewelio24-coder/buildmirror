import { isMockMode } from "@/lib/env";
import { GitHubRepositoryProvider } from "@/lib/adapters/github-repository-provider";
import { MockRepositoryProvider } from "@/lib/adapters/mock-repository-provider";
import type { RepositoryProvider } from "@/lib/adapters/repository-provider";

export function getRepositoryProvider(): RepositoryProvider {
  if (isMockMode()) {
    return new MockRepositoryProvider();
  }
  // TODO: APP_DATA_MODE=supabase 이후에도 GitHub App이 없으면 mock SHA 확인을 유지한다.
  // GitHub App 설치가 완료되면 GitHubRepositoryProvider로 교체한다.
  return new MockRepositoryProvider();
}

export function getGitHubRepositoryProvider(): GitHubRepositoryProvider {
  return new GitHubRepositoryProvider();
}
