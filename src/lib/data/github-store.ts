import type { GitHubInstallation, Repository } from "@/lib/types/domain";
import type {
  RecordGitHubRepositoryInput,
  UpsertGitHubInstallationInput,
} from "@/lib/github/types";

export type GitHubInstallNonceRecord = {
  nonce: string;
  userId: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type GitHubInstallClaim = {
  nonce: string;
  userId: string;
  githubExternalInstallationId: number;
  returnTo: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type ConsumeNonceResult = "consumed" | "missing" | "expired" | "reused";

export interface GitHubStore {
  listInstallations(userId: string): Promise<GitHubInstallation[]>;
  getInstallation(userId: string, installationId: string): Promise<GitHubInstallation>;
  getInstallationByExternalId(
    userId: string,
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null>;
  upsertInstallation(
    userId: string,
    input: UpsertGitHubInstallationInput,
  ): Promise<GitHubInstallation>;
  createInstallNonce(
    userId: string,
    nonce: string,
    expiresAt: string,
  ): Promise<void>;
  consumeInstallNonce(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<ConsumeNonceResult>;
  createInstallClaim(input: {
    userId: string;
    nonce: string;
    githubExternalInstallationId: number;
    returnTo: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void>;
  getInstallClaim(
    userId: string,
    nonce: string,
  ): Promise<GitHubInstallClaim | null>;
  consumeInstallClaim(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<ConsumeNonceResult>;
  findOpenInstallClaim(
    userId: string,
    githubExternalInstallationId: number,
    nowIso: string,
  ): Promise<GitHubInstallClaim | null>;
  listInstallationRepositories(
    userId: string,
    installationId: string,
  ): Promise<Repository[]>;
  recordRepository(
    userId: string,
    input: RecordGitHubRepositoryInput,
  ): Promise<Repository>;
  markMissingRepositories(
    userId: string,
    installationId: string,
    visibleGithubRepositoryIds: number[],
    syncedAt: string,
  ): Promise<void>;
  touchInstallationSync(
    userId: string,
    installationId: string,
    lastSyncedAt: string,
  ): Promise<void>;
}
