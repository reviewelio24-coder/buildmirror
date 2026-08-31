import { AppError } from "@/lib/errors";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GitHubInstallClaim, GitHubStore } from "@/lib/data/github-store";
import {
  mapGitHubInstallation,
  mapRepository,
  type GitHubInstallationRow,
  type RepositoryRow,
} from "@/lib/data/mappers";
import type {
  RecordGitHubRepositoryInput,
  UpsertGitHubInstallationInput,
} from "@/lib/github/types";
import type { GitHubInstallation, Repository } from "@/lib/types/domain";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type GitHubInstallClaimRow = {
  nonce: string;
  user_id: string;
  github_external_installation_id: number;
  return_to: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

function mapInstallClaim(row: GitHubInstallClaimRow): GitHubInstallClaim {
  return {
    nonce: row.nonce,
    userId: row.user_id,
    githubExternalInstallationId: row.github_external_installation_id,
    returnTo: row.return_to,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

function notFound(): never {
  throw new AppError({
    userMessage: "GitHub App 설치를 찾을 수 없습니다.",
    developerCause: "GitHub installation not found or not owned by current user",
    code: "GITHUB_INSTALLATION_NOT_FOUND",
    status: 404,
  });
}

function fromSupabase(error: { message: string; code?: string } | null, userMessage: string): never {
  if (error?.code === "23505") {
    throw new AppError({
      userMessage: "이 GitHub App 설치는 이미 다른 계정에 연결되어 있습니다.",
      developerCause: error.message,
      code: "GITHUB_INSTALLATION_ALREADY_LINKED",
      status: 409,
    });
  }
  throw new AppError({
    userMessage,
    developerCause: error?.message ?? "unknown supabase error",
    code: "SUPABASE_QUERY_FAILED",
    status: 500,
  });
}

export class SupabaseGitHubStore implements GitHubStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async listInstallations(userId: string): Promise<GitHubInstallation[]> {
    const { data, error } = await this.supabase
      .from("github_installations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      fromSupabase(error, "GitHub App 설치 목록을 불러오지 못했습니다.");
    }
    return ((data ?? []) as GitHubInstallationRow[]).map(mapGitHubInstallation);
  }

  async getInstallation(
    userId: string,
    installationId: string,
  ): Promise<GitHubInstallation> {
    const { data, error } = await this.supabase
      .from("github_installations")
      .select("*")
      .eq("id", installationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub App 설치를 불러오지 못했습니다.");
    }
    if (!data) {
      notFound();
    }
    return mapGitHubInstallation(data as GitHubInstallationRow);
  }

  async getInstallationByExternalId(
    userId: string,
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null> {
    const { data, error } = await this.supabase
      .from("github_installations")
      .select("*")
      .eq("user_id", userId)
      .eq("github_external_installation_id", githubExternalInstallationId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub App 설치를 불러오지 못했습니다.");
    }
    return data ? mapGitHubInstallation(data as GitHubInstallationRow) : null;
  }

  async upsertInstallation(
    userId: string,
    input: UpsertGitHubInstallationInput,
  ): Promise<GitHubInstallation> {
    const { data: claimed, error: claimedError } = await this.supabase
      .from("github_installations")
      .select("id, user_id")
      .eq("github_external_installation_id", input.githubExternalInstallationId)
      .maybeSingle();
    if (claimedError) {
      fromSupabase(claimedError, "GitHub App 설치를 확인하지 못했습니다.");
    }
    if (claimed && claimed.user_id !== userId) {
      throw new AppError({
        userMessage: "이 GitHub App 설치는 이미 다른 계정에 연결되어 있습니다.",
        developerCause: "github_external_installation_id belongs to another user",
        code: "GITHUB_INSTALLATION_ALREADY_LINKED",
        status: 409,
      });
    }

    const row = {
      user_id: userId,
      github_external_installation_id: input.githubExternalInstallationId,
      account_login: input.accountLogin,
      account_type: input.accountType,
      account_id: input.accountId,
      repository_selection: input.repositorySelection,
      permissions: input.permissions,
      events: input.events,
      installed_at: input.installedAt,
      suspended_at: input.suspendedAt,
      last_synced_at: input.lastSyncedAt,
      updated_at: input.lastSyncedAt,
    };

    const request = claimed
      ? this.supabase
          .from("github_installations")
          .update(row)
          .eq("id", claimed.id)
          .eq("user_id", userId)
          .select("*")
          .maybeSingle()
      : this.supabase.from("github_installations").insert(row).select("*").single();

    const { data, error } = await request;
    if (error || !data) {
      fromSupabase(error, "GitHub App 설치를 저장하지 못했습니다.");
    }
    return mapGitHubInstallation(data as GitHubInstallationRow);
  }

  async createInstallNonce(
    userId: string,
    nonce: string,
    expiresAt: string,
  ): Promise<void> {
    const { error } = await this.supabase.from("github_install_states").insert({
      nonce,
      user_id: userId,
      expires_at: expiresAt,
    });
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 시작하지 못했습니다.");
    }
  }

  async consumeInstallNonce(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<"consumed" | "missing" | "expired" | "reused"> {
    const { data, error } = await this.supabase
      .from("github_install_states")
      .select("nonce, expires_at, consumed_at")
      .eq("nonce", nonce)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    if (!data) {
      return "missing";
    }
    if (data.consumed_at) {
      return "reused";
    }
    if (Date.parse(data.expires_at as string) <= Date.parse(nowIso)) {
      return "expired";
    }
    const { data: updated, error: updateError } = await this.supabase
      .from("github_install_states")
      .update({ consumed_at: nowIso })
      .eq("nonce", nonce)
      .eq("user_id", userId)
      .is("consumed_at", null)
      .select("nonce")
      .maybeSingle();
    if (updateError) {
      fromSupabase(updateError, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    return updated ? "consumed" : "reused";
  }

  async createInstallClaim(input: {
    userId: string;
    nonce: string;
    githubExternalInstallationId: number;
    returnTo: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void> {
    const { error } = await this.supabase.from("github_install_claims").insert({
      nonce: input.nonce,
      user_id: input.userId,
      github_external_installation_id: input.githubExternalInstallationId,
      return_to: input.returnTo,
      expires_at: input.expiresAt,
      created_at: input.createdAt,
    });
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 시작하지 못했습니다.");
    }
  }

  async getInstallClaim(
    userId: string,
    nonce: string,
  ): Promise<GitHubInstallClaim | null> {
    const { data, error } = await this.supabase
      .from("github_install_claims")
      .select(
        "nonce, user_id, github_external_installation_id, return_to, expires_at, consumed_at, created_at",
      )
      .eq("nonce", nonce)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    return data ? mapInstallClaim(data as GitHubInstallClaimRow) : null;
  }

  async consumeInstallClaim(
    userId: string,
    nonce: string,
    nowIso: string,
  ): Promise<"consumed" | "missing" | "expired" | "reused"> {
    const { data, error } = await this.supabase
      .from("github_install_claims")
      .select("nonce, expires_at, consumed_at")
      .eq("nonce", nonce)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    if (!data) {
      return "missing";
    }
    if (data.consumed_at) {
      return "reused";
    }
    if (Date.parse(data.expires_at as string) <= Date.parse(nowIso)) {
      return "expired";
    }
    const { data: updated, error: updateError } = await this.supabase
      .from("github_install_claims")
      .update({ consumed_at: nowIso })
      .eq("nonce", nonce)
      .eq("user_id", userId)
      .is("consumed_at", null)
      .select("nonce")
      .maybeSingle();
    if (updateError) {
      fromSupabase(updateError, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    return updated ? "consumed" : "reused";
  }

  async findOpenInstallClaim(
    userId: string,
    githubExternalInstallationId: number,
    nowIso: string,
  ): Promise<GitHubInstallClaim | null> {
    const { data, error } = await this.supabase
      .from("github_install_claims")
      .select(
        "nonce, user_id, github_external_installation_id, return_to, expires_at, consumed_at, created_at",
      )
      .eq("user_id", userId)
      .eq("github_external_installation_id", githubExternalInstallationId)
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub 설치 요청을 확인하지 못했습니다.");
    }
    return data ? mapInstallClaim(data as GitHubInstallClaimRow) : null;
  }

  async listInstallationRepositories(
    userId: string,
    installationId: string,
  ): Promise<Repository[]> {
    await this.getInstallation(userId, installationId);
    const { data, error } = await this.supabase
      .from("repositories")
      .select("*")
      .eq("user_id", userId)
      .eq("github_installation_id", installationId);
    if (error) {
      fromSupabase(error, "연결 저장소 목록을 불러오지 못했습니다.");
    }
    return ((data ?? []) as RepositoryRow[]).map(mapRepository);
  }

  async recordRepository(
    userId: string,
    input: RecordGitHubRepositoryInput,
  ): Promise<Repository> {
    await this.getInstallation(userId, input.installationId);
    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await this.supabase
      .from("repositories")
      .select("*")
      .eq("user_id", userId)
      .eq("github_repository_id", input.githubRepositoryId)
      .maybeSingle();
    if (existingError) {
      fromSupabase(existingError, "저장소 정보를 확인하지 못했습니다.");
    }

    const payload = {
      user_id: userId,
      provider: "github" as const,
      provider_id: String(input.githubRepositoryId),
      owner: input.owner,
      name: input.name,
      full_name: input.fullName,
      default_branch: input.defaultBranch,
      html_url: input.htmlUrl,
      is_private: input.isPrivate,
      is_archived: input.isArchived,
      is_disabled: input.isDisabled,
      github_permissions: input.permissions,
      github_pushed_at: input.githubPushedAt,
      last_synced_at: input.lastSyncedAt ?? now,
      github_installation_id: input.installationId,
      github_repository_id: input.githubRepositoryId,
      connection_status: "connected" as const,
      updated_at: now,
      ...(input.headSha !== undefined ? { head_sha: input.headSha } : {}),
    };

    const request = existing
      ? this.supabase
          .from("repositories")
          .update(payload)
          .eq("id", (existing as RepositoryRow).id)
          .eq("user_id", userId)
          .select("*")
          .maybeSingle()
      : this.supabase.from("repositories").insert(payload).select("*").single();

    const { data, error } = await request;
    if (error || !data) {
      fromSupabase(error, "GitHub 저장소 메타데이터를 저장하지 못했습니다.");
    }
    return mapRepository(data as RepositoryRow);
  }

  async markMissingRepositories(
    userId: string,
    installationId: string,
    visibleGithubRepositoryIds: number[],
    syncedAt: string,
  ): Promise<void> {
    await this.getInstallation(userId, installationId);
    let query = this.supabase
      .from("repositories")
      .update({
        connection_status: "inaccessible",
        last_synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq("user_id", userId)
      .eq("github_installation_id", installationId)
      .not("github_repository_id", "is", null);
    if (visibleGithubRepositoryIds.length > 0) {
      query = query.not(
        "github_repository_id",
        "in",
        `(${visibleGithubRepositoryIds.join(",")})`,
      );
    }
    const { error } = await query;
    if (error) {
      fromSupabase(error, "저장소 접근 상태를 갱신하지 못했습니다.");
    }
  }

  async touchInstallationSync(
    userId: string,
    installationId: string,
    lastSyncedAt: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("github_installations")
      .update({ last_synced_at: lastSyncedAt, updated_at: lastSyncedAt })
      .eq("id", installationId)
      .eq("user_id", userId);
    if (error) {
      fromSupabase(error, "GitHub 설치 동기화 시각을 저장하지 못했습니다.");
    }
  }
}
