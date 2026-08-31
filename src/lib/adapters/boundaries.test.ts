import { describe, expect, it } from "vitest";
import { GitHubRepositoryProvider } from "@/lib/adapters/github-repository-provider";
import { UnimplementedAnalysisWorker } from "@/lib/adapters/analysis-worker";
import { NotImplementedError } from "@/lib/errors";

describe("unimplemented adapter boundaries", () => {
  it("does not pretend GitHub App is connected", async () => {
    const provider = new GitHubRepositoryProvider();
    await expect(provider.listRepositories()).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("does not pretend an analysis worker is running", async () => {
    const worker = new UnimplementedAnalysisWorker();
    await expect(worker.enqueue()).rejects.toBeInstanceOf(NotImplementedError);
  });
});
