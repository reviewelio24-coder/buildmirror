import { NotImplementedError } from "@/lib/errors";
import type { RepositoryMetadata, RepositoryProvider } from "@/lib/adapters/repository-provider";

/**
 * GitHub App 연동 지점.
 * JWT·installation token·API client는 `src/lib/github/`에 있습니다.
 * 설치 callback과 저장소 연결 UI는 `src/lib/github/`과 프로젝트 설정에서 처리합니다.
 * webhook은 `POST /api/github/webhooks`에서 처리합니다.
 * 이 adapter의 clone·head SHA 조회는 아직 구현하지 않습니다.
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
