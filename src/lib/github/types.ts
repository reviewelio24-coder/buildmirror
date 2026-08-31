import { z } from "zod";

export const githubAccountTypeSchema = z.enum(["User", "Organization"]);

export const githubInstallationApiSchema = z.object({
  id: z.number().int().positive(),
  account: z
    .object({
      login: z.string().min(1),
      id: z.number().int().positive(),
      type: z.string().min(1),
    })
    .nullable(),
  repository_selection: z.enum(["all", "selected"]),
  permissions: z.record(z.string(), z.string()).optional().default({}),
  events: z.array(z.string()).optional().default([]),
  created_at: z.string().min(1),
  suspended_at: z.string().nullable().optional(),
});

const githubPermissionValueSchema = z.union([
  z.string(),
  z.boolean().transform((value) => (value ? "true" : "false")),
]);

export const githubRepositoryApiSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().min(1),
  private: z.boolean(),
  html_url: z.string().url(),
  default_branch: z.string().min(1),
  owner: z.object({
    login: z.string().min(1),
  }),
  archived: z.boolean().optional().default(false),
  disabled: z.boolean().optional().default(false),
  permissions: z
    .record(z.string(), githubPermissionValueSchema)
    .optional()
    .default({}),
  pushed_at: z.string().nullable().optional(),
});

export const githubInstallationRepositoriesApiSchema = z.object({
  total_count: z.number().int().nonnegative().optional(),
  repositories: z.array(githubRepositoryApiSchema),
});

export const githubUserAccessTokenApiSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
});

export const githubUserInstallationsApiSchema = z.object({
  total_count: z.number().int().nonnegative().optional(),
  installations: z.array(
    githubInstallationApiSchema.extend({
      app_id: z.number().int().positive(),
    }),
  ),
});

export const githubInstallationTokenApiSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().min(1),
  permissions: z.record(z.string(), z.string()).optional(),
  repository_selection: z.enum(["all", "selected"]).optional(),
});

export type GitHubInstallationApi = z.infer<typeof githubInstallationApiSchema>;
export type GitHubRepositoryApi = z.infer<typeof githubRepositoryApiSchema>;
export type GitHubInstallationTokenApi = z.infer<
  typeof githubInstallationTokenApiSchema
>;

export type MappedGitHubInstallation = {
  githubExternalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  accountId: number;
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  events: string[];
  installedAt: string;
  suspendedAt: string | null;
};

export type MappedGitHubRepository = {
  githubRepositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  isPrivate: boolean;
  isArchived: boolean;
  isDisabled: boolean;
  permissions: Record<string, string>;
  githubPushedAt: string | null;
};

export type GitHubInstallationAccessToken = {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repositorySelection: "all" | "selected" | null;
};

export type UpsertGitHubInstallationInput = {
  githubExternalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  accountId: number;
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  events: string[];
  installedAt: string;
  suspendedAt: string | null;
  lastSyncedAt: string;
};

export type RecordGitHubRepositoryInput = {
  installationId: string;
  githubRepositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  isPrivate: boolean;
  isArchived: boolean;
  isDisabled: boolean;
  permissions: Record<string, string>;
  githubPushedAt: string | null;
  lastSyncedAt?: string;
  headSha?: string | null;
};
