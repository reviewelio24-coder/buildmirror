import "server-only";

import { AppError } from "@/lib/errors";
import type { createWebhookAdminClient } from "@/lib/supabase/webhook-admin";
import {
  mapGitHubInstallation,
  mapJob,
  mapRepository,
  mapSnapshot,
  type GitHubInstallationRow,
  type JobRow,
  type RepositoryRow,
  type SnapshotRow,
} from "@/lib/data/mappers";
import type {
  ClaimDeliveryResult,
  GitHubPushJobInput,
  GitHubWebhookStore,
  WebhookRepositoryUpsert,
} from "@/lib/data/webhook-store";
import type {
  AnalysisJob,
  AnalysisSnapshot,
  GitHubInstallation,
  GitHubWebhookDelivery,
  Repository,
  WebhookDeliveryStatus,
} from "@/lib/types/domain";

type AdminClient = ReturnType<typeof createWebhookAdminClient>;

type DeliveryRow = {
  github_delivery_id: string;
  github_event: string;
  action: string | null;
  github_external_installation_id: number | null;
  github_repository_id: number | null;
  processing_status: WebhookDeliveryStatus;
  error_code: string | null;
  received_at: string;
  processed_at: string | null;
};

function fromSupabase(
  error: { message: string } | null,
  userMessage: string,
): never {
  throw new AppError({
    userMessage,
    developerCause: error?.message ?? "unknown supabase error",
    code: "SUPABASE_QUERY_FAILED",
    status: 500,
  });
}

export class SupabaseWebhookStore implements GitHubWebhookStore {
  constructor(private readonly supabase: AdminClient) {}

  async claimDelivery(input: {
    deliveryId: string;
    event: string;
    action: string | null;
    githubExternalInstallationId: number | null;
    githubRepositoryId: number | null;
  }): Promise<ClaimDeliveryResult> {
    const { data, error } = await this.supabase.rpc(
      "claim_github_webhook_delivery",
      {
        p_delivery_id: input.deliveryId,
        p_event: input.event,
        p_action: input.action,
        p_installation_id: input.githubExternalInstallationId,
        p_repository_id: input.githubRepositoryId,
      },
    );
    if (error || !data) {
      fromSupabase(error, "webhook delivery를 기록하지 못했습니다.");
    }
    const result = data as { kind?: string; status?: string };
    if (
      result.kind === "new" ||
      result.kind === "duplicate" ||
      result.kind === "retry"
    ) {
      return {
        kind: result.kind,
        status: (result.status as WebhookDeliveryStatus) ?? "received",
      };
    }
    throw new AppError({
      userMessage: "webhook delivery를 기록하지 못했습니다.",
      developerCause: "claim_github_webhook_delivery returned an unexpected payload",
      code: "SUPABASE_QUERY_FAILED",
      status: 500,
    });
  }

  async finishDelivery(
    deliveryId: string,
    status: Exclude<WebhookDeliveryStatus, "received">,
    errorCode?: string | null,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("finish_github_webhook_delivery", {
      p_delivery_id: deliveryId,
      p_status: status,
      p_error_code: errorCode ?? null,
    });
    if (error) {
      fromSupabase(error, "webhook delivery 상태를 저장하지 못했습니다.");
    }
  }

  async getDelivery(
    deliveryId: string,
  ): Promise<GitHubWebhookDelivery | null> {
    const { data, error } = await this.supabase
      .from("github_webhook_deliveries")
      .select(
        "github_delivery_id, github_event, action, github_external_installation_id, github_repository_id, processing_status, error_code, received_at, processed_at",
      )
      .eq("github_delivery_id", deliveryId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "webhook delivery를 확인하지 못했습니다.");
    }
    if (!data) {
      return null;
    }
    const row = data as DeliveryRow;
    return {
      githubDeliveryId: row.github_delivery_id,
      githubEvent: row.github_event,
      action: row.action,
      githubExternalInstallationId: row.github_external_installation_id,
      githubRepositoryId: row.github_repository_id,
      processingStatus: row.processing_status,
      errorCode: row.error_code,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
    };
  }

  async findInstallationByExternalId(
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null> {
    const { data, error } = await this.supabase
      .from("github_installations")
      .select("*")
      .eq("github_external_installation_id", githubExternalInstallationId)
      .maybeSingle();
    if (error) {
      fromSupabase(error, "GitHub 설치를 확인하지 못했습니다.");
    }
    return data
      ? mapGitHubInstallation(data as GitHubInstallationRow)
      : null;
  }

  async applyInstallationAction(
    githubExternalInstallationId: number,
    action: "deleted" | "suspend" | "unsuspend",
    at: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(
      "apply_github_webhook_installation",
      {
        p_external_installation_id: githubExternalInstallationId,
        p_action: action,
        p_at: at,
      },
    );
    if (error) {
      fromSupabase(error, "GitHub 설치 상태를 갱신하지 못했습니다.");
    }
    return Boolean(data);
  }

  async markRepositoriesAccess(
    githubExternalInstallationId: number,
    githubRepositoryIds: number[],
    accessible: boolean,
    at: string,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc(
      "apply_github_webhook_repository_access",
      {
        p_external_installation_id: githubExternalInstallationId,
        p_github_repository_ids: githubRepositoryIds,
        p_accessible: accessible,
        p_at: at,
      },
    );
    if (error) {
      fromSupabase(error, "저장소 접근 상태를 갱신하지 못했습니다.");
    }
    return typeof data === "number" ? data : 0;
  }

  async upsertRepository(
    input: WebhookRepositoryUpsert,
    at: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(
      "upsert_github_webhook_repository",
      {
        p_external_installation_id: input.githubExternalInstallationId,
        p_github_repository_id: input.githubRepositoryId,
        p_owner: input.owner,
        p_name: input.name,
        p_full_name: input.fullName,
        p_html_url: input.htmlUrl,
        p_default_branch: input.defaultBranch,
        p_is_private: input.isPrivate,
        p_is_archived: input.isArchived,
        p_is_disabled: input.isDisabled,
        p_at: at,
      },
    );
    if (error) {
      fromSupabase(error, "저장소 메타데이터를 갱신하지 못했습니다.");
    }
    return Boolean(data);
  }

  async enqueuePushJobs(input: GitHubPushJobInput): Promise<number> {
    const { data, error } = await this.supabase.rpc(
      "enqueue_github_push_analysis_jobs",
      {
        p_delivery_id: input.deliveryId,
        p_external_installation_id: input.githubExternalInstallationId,
        p_github_repository_id: input.githubRepositoryId,
        p_trigger_ref: input.triggerRef,
        p_trigger_sha: input.triggerSha,
      },
    );
    if (error) {
      fromSupabase(error, "분석 작업을 만들지 못했습니다.");
    }
    return typeof data === "number" ? data : 0;
  }

  async listJobs(): Promise<AnalysisJob[]> {
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      fromSupabase(error, "분석 작업을 불러오지 못했습니다.");
    }
    return ((data ?? []) as JobRow[]).map(mapJob);
  }

  async listSnapshots(): Promise<AnalysisSnapshot[]> {
    const { data, error } = await this.supabase
      .from("analysis_snapshots")
      .select("*");
    if (error) {
      fromSupabase(error, "분석 스냅샷을 불러오지 못했습니다.");
    }
    return ((data ?? []) as SnapshotRow[]).map(mapSnapshot);
  }

  async listRepositories(): Promise<Repository[]> {
    const { data, error } = await this.supabase.from("repositories").select("*");
    if (error) {
      fromSupabase(error, "저장소 목록을 불러오지 못했습니다.");
    }
    return ((data ?? []) as RepositoryRow[]).map(mapRepository);
  }
}
