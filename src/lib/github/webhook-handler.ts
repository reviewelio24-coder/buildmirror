import type { GitHubWebhookStore } from "@/lib/data/webhook-store";
import {
  ownerFromWebhookRepository,
  parseWebhookActionPayload,
  type webhookRepositorySchema,
} from "@/lib/github/webhook-payloads";
import type { z } from "zod";

export const GITHUB_WEBHOOK_EVENTS = [
  "ping",
  "installation",
  "installation_repositories",
  "repository",
  "push",
  "pull_request",
] as const;

export type GitHubWebhookEvent = (typeof GITHUB_WEBHOOK_EVENTS)[number];

const ZERO_SHA = /^0+$/;
const SHA_PATTERN = /^[0-9a-f]{40,64}$/i;

export function isGitHubWebhookEvent(value: string): value is GitHubWebhookEvent {
  return (GITHUB_WEBHOOK_EVENTS as readonly string[]).includes(value);
}

type WebhookRepository = z.infer<typeof webhookRepositorySchema>;

function toUpsert(
  githubExternalInstallationId: number,
  repository: WebhookRepository,
) {
  const owner = ownerFromWebhookRepository(repository);
  const name = repository.name ?? repository.full_name?.split("/")[1] ?? "unknown";
  return {
    githubExternalInstallationId,
    githubRepositoryId: repository.id,
    owner: owner ?? "unknown",
    name,
    fullName: repository.full_name ?? (owner ? `${owner}/${name}` : null),
    htmlUrl: repository.html_url ?? null,
    defaultBranch: repository.default_branch ?? null,
    isPrivate: repository.private ?? null,
    isArchived: repository.archived ?? null,
    isDisabled: repository.disabled ?? null,
  };
}

export async function processGitHubWebhookEvent(input: {
  event: string;
  deliveryId: string;
  payload: unknown;
  store: GitHubWebhookStore;
  now?: Date;
}): Promise<"processed" | "ignored"> {
  const nowIso = (input.now ?? new Date()).toISOString();
  if (input.event === "ping") {
    return "processed";
  }
  if (input.event === "pull_request") {
    return "processed";
  }

  const parsed = parseWebhookActionPayload(input.payload);
  if (!parsed.success) {
    return "ignored";
  }
  const body = parsed.data;
  const installationId = body.installation?.id ?? null;
  const action = body.action ?? null;

  if (input.event === "installation") {
    if (
      action !== "deleted" &&
      action !== "suspend" &&
      action !== "unsuspend"
    ) {
      return "ignored";
    }
    if (!installationId) {
      return "ignored";
    }
    const applied = await input.store.applyInstallationAction(
      installationId,
      action,
      nowIso,
    );
    return applied ? "processed" : "ignored";
  }

  if (input.event === "installation_repositories") {
    if (!installationId) {
      return "ignored";
    }
    if (action === "removed") {
      const ids = (body.repositories_removed ?? []).map((item) => item.id);
      if (ids.length === 0) {
        return "ignored";
      }
      await input.store.markRepositoriesAccess(
        installationId,
        ids,
        false,
        nowIso,
      );
      return "processed";
    }
    if (action === "added") {
      const added = body.repositories_added ?? [];
      if (added.length === 0) {
        return "ignored";
      }
      for (const repository of added) {
        await input.store.upsertRepository(
          toUpsert(installationId, repository),
          nowIso,
        );
      }
      return "processed";
    }
    return "ignored";
  }

  if (input.event === "repository") {
    if (!installationId || !body.repository) {
      return "ignored";
    }
    if (action === "deleted") {
      await input.store.markRepositoriesAccess(
        installationId,
        [body.repository.id],
        false,
        nowIso,
      );
      return "processed";
    }
    if (
      action === "renamed" ||
      action === "edited" ||
      action === "archived" ||
      action === "unarchived" ||
      action === "privatized" ||
      action === "publicized"
    ) {
      await input.store.upsertRepository(
        toUpsert(installationId, body.repository),
        nowIso,
      );
      return "processed";
    }
    return "ignored";
  }

  if (input.event === "push") {
    if (!installationId || !body.repository) {
      return "ignored";
    }
    if (body.deleted) {
      return "ignored";
    }
    const ref = body.ref ?? "";
    const after = body.after ?? "";
    if (!ref.startsWith("refs/heads/")) {
      return "ignored";
    }
    if (!SHA_PATTERN.test(after) || ZERO_SHA.test(after)) {
      return "ignored";
    }
    await input.store.upsertRepository(
      toUpsert(installationId, body.repository),
      nowIso,
    );
    await input.store.enqueuePushJobs({
      deliveryId: input.deliveryId,
      githubExternalInstallationId: installationId,
      githubRepositoryId: body.repository.id,
      triggerRef: ref,
      triggerSha: after,
    });
    return "processed";
  }

  return "ignored";
}
