import { z } from "zod";

const githubIdSchema = z.number().int().positive();

export const webhookInstallationSchema = z.object({
  id: githubIdSchema,
  suspended_at: z.string().nullable().optional(),
});

export const webhookRepositorySchema = z.object({
  id: githubIdSchema,
  name: z.string().min(1).optional(),
  full_name: z.string().min(1).optional(),
  private: z.boolean().optional(),
  html_url: z.string().url().optional(),
  default_branch: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  disabled: z.boolean().optional(),
  owner: z
    .object({
      login: z.string().min(1),
    })
    .optional(),
});

export const webhookActionPayloadSchema = z.object({
  action: z.string().optional(),
  installation: webhookInstallationSchema.optional(),
  repository: webhookRepositorySchema.optional(),
  repositories_added: z.array(webhookRepositorySchema).optional(),
  repositories_removed: z.array(webhookRepositorySchema).optional(),
  ref: z.string().optional(),
  after: z.string().optional(),
  deleted: z.boolean().optional(),
});

export function parseWebhookActionPayload(payload: unknown) {
  return webhookActionPayloadSchema.safeParse(payload);
}

export function ownerFromWebhookRepository(
  repository: z.infer<typeof webhookRepositorySchema>,
): string | null {
  if (repository.owner?.login) {
    return repository.owner.login;
  }
  const fullName = repository.full_name;
  if (!fullName) {
    return null;
  }
  const [owner] = fullName.split("/");
  return owner || null;
}
