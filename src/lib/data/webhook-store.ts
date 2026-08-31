import type {
  AnalysisJob,
  AnalysisSnapshot,
  GitHubInstallation,
  GitHubWebhookDelivery,
  Repository,
  WebhookDeliveryStatus,
} from "@/lib/types/domain";

export type ClaimDeliveryResult = {
  kind: "new" | "duplicate" | "retry";
  status: WebhookDeliveryStatus;
};

export type WebhookRepositoryUpsert = {
  githubExternalInstallationId: number;
  githubRepositoryId: number;
  owner: string;
  name: string;
  fullName: string | null;
  htmlUrl: string | null;
  defaultBranch: string | null;
  isPrivate: boolean | null;
  isArchived: boolean | null;
  isDisabled: boolean | null;
};

export type GitHubPushJobInput = {
  deliveryId: string;
  githubExternalInstallationId: number;
  githubRepositoryId: number;
  triggerRef: string;
  triggerSha: string;
};

export interface GitHubWebhookStore {
  claimDelivery(input: {
    deliveryId: string;
    event: string;
    action: string | null;
    githubExternalInstallationId: number | null;
    githubRepositoryId: number | null;
  }): Promise<ClaimDeliveryResult>;
  finishDelivery(
    deliveryId: string,
    status: Exclude<WebhookDeliveryStatus, "received">,
    errorCode?: string | null,
  ): Promise<void>;
  getDelivery(deliveryId: string): Promise<GitHubWebhookDelivery | null>;
  findInstallationByExternalId(
    githubExternalInstallationId: number,
  ): Promise<GitHubInstallation | null>;
  applyInstallationAction(
    githubExternalInstallationId: number,
    action: "deleted" | "suspend" | "unsuspend",
    at: string,
  ): Promise<boolean>;
  markRepositoriesAccess(
    githubExternalInstallationId: number,
    githubRepositoryIds: number[],
    accessible: boolean,
    at: string,
  ): Promise<number>;
  upsertRepository(input: WebhookRepositoryUpsert, at: string): Promise<boolean>;
  enqueuePushJobs(input: GitHubPushJobInput): Promise<number>;
  listJobs(): Promise<AnalysisJob[]>;
  listSnapshots(): Promise<AnalysisSnapshot[]>;
  listRepositories(): Promise<Repository[]>;
}
