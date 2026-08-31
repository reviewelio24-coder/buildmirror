import type { Repository } from "@/lib/types/domain";

export type RepositoryMetadata = {
  providerId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  headSha: string;
  connectionStatus: "connected" | "disconnected";
};

export type RepositoryLookup = Pick<
  Repository,
  "id" | "providerId" | "owner" | "name" | "defaultBranch"
>;

export interface RepositoryProvider {
  listRepositories(userId: string): Promise<RepositoryMetadata[]>;
  getRepositoryMetadata(lookup: RepositoryLookup): Promise<RepositoryMetadata>;
  getDefaultBranch(lookup: RepositoryLookup): Promise<string>;
  getHeadSha(lookup: RepositoryLookup): Promise<string>;
  getConnectionStatus(
    lookup: RepositoryLookup,
  ): Promise<"connected" | "disconnected">;
}
