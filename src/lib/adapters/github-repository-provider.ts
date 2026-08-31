import { NotImplementedError } from "@/lib/errors";
import type { RepositoryMetadata, RepositoryProvider } from "@/lib/adapters/repository-provider";

/**
 * GitHub App 연동 지점.
 * 저장소 목록, 메타데이터, 기본 브랜치, head SHA, 설치 상태 확인을 여기서 구현한다.
 */
export class GitHubRepositoryProvider implements RepositoryProvider {
  async listRepositories(): Promise<RepositoryMetadata[]> {
    throw new NotImplementedError("GitHub 저장소 목록 조회", "GITHUB_LIST_REPOS");
  }

  async getRepositoryMetadata(): Promise<RepositoryMetadata> {
    throw new NotImplementedError(
      "GitHub 저장소 메타데이터 조회",
      "GITHUB_REPO_METADATA",
    );
  }

  async getDefaultBranch(): Promise<string> {
    throw new NotImplementedError("GitHub 기본 브랜치 조회", "GITHUB_DEFAULT_BRANCH");
  }

  async getHeadSha(): Promise<string> {
    throw new NotImplementedError("GitHub head SHA 조회", "GITHUB_HEAD_SHA");
  }

  async getConnectionStatus(): Promise<"connected" | "disconnected"> {
    throw new NotImplementedError(
      "GitHub App 연결 상태 확인",
      "GITHUB_CONNECTION_STATUS",
    );
  }
}
