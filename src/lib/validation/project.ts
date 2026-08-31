import { z } from "zod";

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "프로젝트 이름을 입력하세요.")
    .max(80, "프로젝트 이름은 80자 이하여야 합니다."),
  repositoryOwner: z
    .string()
    .trim()
    .min(1, "저장소 owner를 입력하세요.")
    .max(100),
  repositoryName: z
    .string()
    .trim()
    .min(1, "저장소 name을 입력하세요.")
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "저장소 name 형식이 올바르지 않습니다."),
  defaultBranch: z
    .string()
    .trim()
    .min(1, "기본 브랜치를 입력하세요.")
    .max(100)
    .default("main"),
});

export const renameProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "프로젝트 이름을 입력하세요.")
    .max(80, "프로젝트 이름은 80자 이하여야 합니다."),
});

export const deleteProjectSchema = z.object({
  confirmName: z.string().trim().min(1),
});
