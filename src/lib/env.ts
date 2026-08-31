import { z } from "zod";

const envSchema = z.object({
  APP_DATA_MODE: z.enum(["mock", "supabase"]).default("mock"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

function readEnv(): AppEnv {
  const parsed = envSchema.safeParse({
    APP_DATA_MODE: process.env.APP_DATA_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `환경변수 형식이 올바르지 않습니다: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }

  const env = parsed.data;
  if (env.APP_DATA_MODE === "supabase") {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error(
        "APP_DATA_MODE=supabase 에서는 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.",
      );
    }
  }

  return env;
}

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) {
    cached = readEnv();
  }
  return cached;
}

export function isMockMode(): boolean {
  return getEnv().APP_DATA_MODE === "mock";
}

export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
