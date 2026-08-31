import { describe, expect, it } from "vitest";
import { createMemoryGitHubStore } from "@/lib/data/mock-github-store";
import { createMemoryProjectStore } from "@/lib/data/mock-project-store";
import { createMemoryWebhookStore } from "@/lib/data/mock-webhook-store";
import type { GitHubWebhookStore } from "@/lib/data/webhook-store";
import type { UpsertGitHubInstallationInput } from "@/lib/github/types";
import { receiveGitHubWebhook } from "@/lib/github/webhook-http";
import { createGitHubWebhookSignature } from "@/lib/github/webhook-signature";
import {
  DEMO_USER_ID,
  PROJECT_IDS,
  SNAPSHOT_IDS,
} from "@/lib/ids";
import { createDemoStoreData } from "@/lib/mock/seed";

const SECRET = "webhook-secret-value-16";
const INSTALLATION_ID = 9001;
const GITHUB_REPO_ID = 800001;
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const installationInput: UpsertGitHubInstallationInput = {
  githubExternalInstallationId: INSTALLATION_ID,
  accountLogin: "demo-user",
  accountType: "User",
  accountId: 101,
  repositorySelection: "selected",
  permissions: { contents: "read" },
  events: ["push"],
  installedAt: "2026-08-31T01:00:00.000Z",
  suspendedAt: null,
  lastSyncedAt: "2026-08-31T01:05:00.000Z",
};

async function linkedWorld() {
  const projects = createMemoryProjectStore(createDemoStoreData());
  const github = createMemoryGitHubStore();
  github.useSharedRepositories(projects.memoryData().repositories);
  const saved = await github.upsertInstallation(DEMO_USER_ID, installationInput);
  const repo = await github.recordRepository(DEMO_USER_ID, {
    installationId: saved.id,
    githubRepositoryId: GITHUB_REPO_ID,
    owner: "demo-user",
    name: "github-notes",
    fullName: "demo-user/github-notes",
    defaultBranch: "main",
    htmlUrl: "https://github.com/demo-user/github-notes",
    isPrivate: false,
    isArchived: false,
    isDisabled: false,
    permissions: { contents: "read" },
    githubPushedAt: "2026-08-30T12:00:00.000Z",
  });
  await projects.linkPrimaryRepository(DEMO_USER_ID, PROJECT_IDS.a, repo);
  await projects.linkPrimaryRepository(DEMO_USER_ID, PROJECT_IDS.b, repo);
  const webhookStore = createMemoryWebhookStore({
    github: github.memoryData(),
    projects: projects.memoryData(),
  });
  return { github, projects, webhookStore, repo, saved };
}

function headers(raw: Buffer, event: string, delivery: string) {
  return new Headers({
    "content-type": "application/json",
    "x-hub-signature-256": createGitHubWebhookSignature(SECRET, raw),
    "x-github-delivery": delivery,
    "x-github-event": event,
  });
}

async function post(
  webhookStore: GitHubWebhookStore,
  event: string,
  payload: unknown,
  delivery: string,
) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return receiveGitHubWebhook({
    headers: headers(rawBody, event, delivery),
    rawBody,
    secret: SECRET,
    store: webhookStore,
  });
}

function pushPayload(overrides: Record<string, unknown> = {}) {
  return {
    ref: "refs/heads/main",
    after: SHA,
    deleted: false,
    installation: { id: INSTALLATION_ID },
    repository: {
      id: GITHUB_REPO_ID,
      name: "github-notes",
      full_name: "demo-user/github-notes",
      default_branch: "main",
      private: false,
      owner: { login: "demo-user" },
    },
    ...overrides,
  };
}

function throwingApply(store: GitHubWebhookStore): GitHubWebhookStore {
  return {
    claimDelivery: (input) => store.claimDelivery(input),
    finishDelivery: (id, status, error) => store.finishDelivery(id, status, error),
    getDelivery: (id) => store.getDelivery(id),
    findInstallationByExternalId: (id) => store.findInstallationByExternalId(id),
    applyInstallationAction: async () => {
      throw new Error("boom");
    },
    markRepositoriesAccess: (installationId, repositoryIds, accessible, at) =>
      store.markRepositoriesAccess(installationId, repositoryIds, accessible, at),
    upsertRepository: (input, at) => store.upsertRepository(input, at),
    enqueuePushJobs: (input) => store.enqueuePushJobs(input),
    listJobs: () => store.listJobs(),
    listSnapshots: () => store.listSnapshots(),
    listRepositories: () => store.listRepositories(),
  };
}

describe("GitHub webhook event handling", () => {
  it("is idempotent for a duplicate delivery and retries a failed one", async () => {
    const { webhookStore } = await linkedWorld();
    const payload = {
      action: "suspend",
      installation: { id: INSTALLATION_ID },
    };
    const first = await post(webhookStore, "installation", payload, "delivery-1");
    const second = await post(webhookStore, "installation", payload, "delivery-1");
    expect(first.code).toBe("PROCESSED");
    expect(second.code).toBe("DUPLICATE_DELIVERY");
    const installation = await webhookStore.findInstallationByExternalId(
      INSTALLATION_ID,
    );
    expect(installation?.suspendedAt).toBeTruthy();

    const failed = await receiveGitHubWebhook({
      headers: headers(
        Buffer.from(
          JSON.stringify({
            action: "unsuspend",
            installation: { id: INSTALLATION_ID },
          }),
        ),
        "installation",
        "delivery-fail",
      ),
      rawBody: Buffer.from(
        JSON.stringify({
          action: "unsuspend",
          installation: { id: INSTALLATION_ID },
        }),
      ),
      secret: SECRET,
      store: throwingApply(webhookStore),
    });
    expect(failed.status).toBe(500);
    expect((await webhookStore.getDelivery("delivery-fail"))?.processingStatus).toBe(
      "failed",
    );

    const retried = await post(
      webhookStore,
      "installation",
      { action: "unsuspend", installation: { id: INSTALLATION_ID } },
      "delivery-fail",
    );
    expect(retried.code).toBe("PROCESSED");
    expect(
      (await webhookStore.findInstallationByExternalId(INSTALLATION_ID))?.suspendedAt,
    ).toBeNull();
  });

  it("marks installation deletion without deleting snapshots or scores", async () => {
    const { webhookStore, projects } = await linkedWorld();
    const before = await projects.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(before.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);
    const snapshotCount = (await webhookStore.listSnapshots()).length;

    await post(
      webhookStore,
      "installation",
      { action: "deleted", installation: { id: INSTALLATION_ID } },
      "delivery-deleted",
    );
    expect(
      (await webhookStore.findInstallationByExternalId(INSTALLATION_ID))?.deletedAt,
    ).toBeTruthy();
    expect(
      (await webhookStore.listRepositories()).find(
        (item) => item.githubRepositoryId === GITHUB_REPO_ID,
      )?.connectionStatus,
    ).toBe("inaccessible");
    const after = await projects.getDashboard(DEMO_USER_ID, PROJECT_IDS.a);
    expect(after.lastSuccessfulSnapshot?.id).toBe(SNAPSHOT_IDS.a);
    expect(after.scores?.snapshotId).toBe(SNAPSHOT_IDS.a);
    expect(after.displayedSnapshot?.learningTasks.length).toBeGreaterThan(0);
    expect(await webhookStore.listSnapshots()).toHaveLength(snapshotCount);

    await post(webhookStore, "push", pushPayload(), "delivery-push-after-delete");
    expect(
      (await webhookStore.listJobs()).filter((item) => item.triggerType === "github_push"),
    ).toHaveLength(0);
  });

  it("marks removed repositories inaccessible and keeps snapshots", async () => {
    const { webhookStore, projects } = await linkedWorld();
    await post(
      webhookStore,
      "installation_repositories",
      {
        action: "removed",
        installation: { id: INSTALLATION_ID },
        repositories_removed: [{ id: GITHUB_REPO_ID, name: "github-notes" }],
      },
      "delivery-removed",
    );
    expect(
      (await webhookStore.listRepositories()).find(
        (item) => item.githubRepositoryId === GITHUB_REPO_ID,
      )?.connectionStatus,
    ).toBe("inaccessible");
    expect(
      (await projects.getDashboard(DEMO_USER_ID, PROJECT_IDS.a)).lastSuccessfulSnapshot
        ?.id,
    ).toBe(SNAPSHOT_IDS.a);
  });

  it("creates pending jobs only for default-branch pushes, one per project", async () => {
    const { webhookStore } = await linkedWorld();
    await post(webhookStore, "push", pushPayload(), "delivery-push-1");
    const jobs = (await webhookStore.listJobs()).filter(
      (item) => item.triggerType === "github_push",
    );
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((item) => item.projectId))).toEqual(
      new Set([PROJECT_IDS.a, PROJECT_IDS.b]),
    );
    expect(jobs.every((item) => item.status === "pending")).toBe(true);
    expect(jobs.every((item) => item.snapshotId === null)).toBe(true);
    expect(jobs.every((item) => item.triggerSha === SHA)).toBe(true);
    expect(jobs.every((item) => item.githubDeliveryId === "delivery-push-1")).toBe(
      true,
    );

    await post(webhookStore, "push", pushPayload(), "delivery-push-2");
    expect(
      (await webhookStore.listJobs()).filter((item) => item.triggerType === "github_push"),
    ).toHaveLength(2);

    await post(
      webhookStore,
      "push",
      pushPayload({ ref: "refs/heads/feature", after: OTHER_SHA }),
      "delivery-branch",
    );
    await post(
      webhookStore,
      "push",
      pushPayload({ ref: "refs/tags/v1", after: OTHER_SHA }),
      "delivery-tag",
    );
    await post(
      webhookStore,
      "push",
      pushPayload({
        deleted: true,
        after: "0000000000000000000000000000000000000000",
      }),
      "delivery-delete-branch",
    );
    expect(
      (await webhookStore.listJobs()).filter((item) => item.triggerType === "github_push"),
    ).toHaveLength(2);
  });

  it("does not create a job for pull_request events", async () => {
    const { webhookStore } = await linkedWorld();
    await post(
      webhookStore,
      "pull_request",
      {
        action: "opened",
        installation: { id: INSTALLATION_ID },
        repository: { id: GITHUB_REPO_ID, default_branch: "main" },
      },
      "delivery-pr",
    );
    expect(
      (await webhookStore.listJobs()).filter((item) => item.triggerType === "github_push"),
    ).toHaveLength(0);
    expect((await webhookStore.getDelivery("delivery-pr"))?.processingStatus).toBe(
      "processed",
    );
  });

  it("ignores unknown installation actions without changing state", async () => {
    const { webhookStore } = await linkedWorld();
    const result = await post(
      webhookStore,
      "installation",
      { action: "created", installation: { id: INSTALLATION_ID } },
      "delivery-created",
    );
    expect(result.code).toBe("IGNORED");
    expect(
      (await webhookStore.findInstallationByExternalId(INSTALLATION_ID))?.deletedAt,
    ).toBeNull();
    expect(
      (await webhookStore.findInstallationByExternalId(INSTALLATION_ID))?.suspendedAt,
    ).toBeNull();
  });

  it("does not store secrets, tokens, or the full payload on deliveries", async () => {
    const { webhookStore } = await linkedWorld();
    const payload = {
      zen: "secret-should-not-be-kept",
      token: "ghs_should_not_be_saved",
    };
    await post(webhookStore, "ping", payload, "delivery-secret");
    const delivery = await webhookStore.getDelivery("delivery-secret");
    const serialized = JSON.stringify(delivery);
    expect(serialized).not.toContain("ghs_");
    expect(serialized).not.toContain("secret-should-not-be-kept");
    expect(serialized).not.toContain(SECRET);
    expect(delivery).not.toHaveProperty("payload");
  });
});
