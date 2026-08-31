import { z } from "zod";

export const linkGitHubRepositorySchema = z.object({
  installationId: z.string().uuid("설치 ID가 올바르지 않습니다."),
  githubRepositoryId: z.coerce.number().int().positive(),
});
