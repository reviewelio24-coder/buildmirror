import { AppError } from "@/lib/errors";

export const GITHUB_API_VERSION = "2022-11-28";
export const GITHUB_API_BASE_URL = "https://api.github.com";

export type GitHubAppConfig = {
  appId: string;
  clientId: string;
  privateKey: string;
  slug: string | null;
};

export type GitHubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  userCallbackUrl: string;
};

export type GitHubEnvSource = {
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_USER_CALLBACK_URL?: string;
  GITHUB_INSTALL_STATE_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  [key: string]: string | undefined;
};

export function normalizePrivateKey(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();
  if (
    !value.includes("BEGIN") ||
    !value.includes("PRIVATE KEY") ||
    !value.includes("END")
  ) {
    throw new AppError({
      userMessage: "GitHub App 비공개 키 형식이 올바르지 않습니다.",
      developerCause: "GITHUB_APP_PRIVATE_KEY is missing PEM BEGIN/END markers",
      code: "GITHUB_APP_PRIVATE_KEY_INVALID",
      status: 500,
    });
  }
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function parseGitHubAppConfig(source: GitHubEnvSource): GitHubAppConfig {
  const missing: string[] = [];
  const appId = source.GITHUB_APP_ID?.trim();
  const clientId = source.GITHUB_APP_CLIENT_ID?.trim();
  const privateKeyRaw = source.GITHUB_APP_PRIVATE_KEY;
  const slug = source.GITHUB_APP_SLUG?.trim() || null;

  if (!appId) {
    missing.push("GITHUB_APP_ID");
  }
  if (!clientId) {
    missing.push("GITHUB_APP_CLIENT_ID");
  }
  if (!privateKeyRaw?.trim()) {
    missing.push("GITHUB_APP_PRIVATE_KEY");
  }
  if (missing.length > 0) {
    throw new AppError({
      userMessage: "GitHub App이 아직 설정되지 않았습니다.",
      developerCause: `Missing GitHub App env: ${missing.join(", ")}`,
      code: "GITHUB_APP_NOT_CONFIGURED",
      status: 501,
    });
  }

  return {
    appId: appId as string,
    clientId: clientId as string,
    privateKey: normalizePrivateKey(privateKeyRaw as string),
    slug,
  };
}

export function isGitHubAppConfigured(source: GitHubEnvSource = process.env): boolean {
  try {
    parseGitHubAppConfig(source);
    return true;
  } catch {
    return false;
  }
}

export function getGitHubAppConfig(): GitHubAppConfig {
  return parseGitHubAppConfig(process.env);
}

const USER_CALLBACK_PATH = "/api/github/user-callback";

export function parseGitHubUserCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 512) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.hash) {
    return null;
  }
  if (parsed.pathname !== USER_CALLBACK_PATH) {
    return null;
  }
  const isLocalHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  const isHttps = parsed.protocol === "https:";
  if (!isLocalHttp && !isHttps) {
    return null;
  }
  return `${parsed.origin}${USER_CALLBACK_PATH}`;
}

export function parseGitHubOAuthConfig(source: GitHubEnvSource): GitHubOAuthConfig {
  const clientId = source.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = source.GITHUB_APP_CLIENT_SECRET?.trim();
  const userCallbackUrl = parseGitHubUserCallbackUrl(source.GITHUB_USER_CALLBACK_URL);
  const missing: string[] = [];
  if (!clientId) {
    missing.push("GITHUB_APP_CLIENT_ID");
  }
  if (!clientSecret) {
    missing.push("GITHUB_APP_CLIENT_SECRET");
  }
  if (!userCallbackUrl) {
    missing.push("GITHUB_USER_CALLBACK_URL");
  }
  if (missing.length > 0) {
    throw new AppError({
      userMessage: "GitHub App이 아직 설정되지 않았습니다.",
      developerCause: `Missing GitHub user OAuth env: ${missing.join(", ")}`,
      code: "GITHUB_APP_NOT_CONFIGURED",
      status: 501,
    });
  }
  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    userCallbackUrl: userCallbackUrl as string,
  };
}

export function isGitHubOAuthConfigured(source: GitHubEnvSource = process.env): boolean {
  try {
    parseGitHubOAuthConfig(source);
    return true;
  } catch {
    return false;
  }
}

export function getGitHubOAuthConfig(): GitHubOAuthConfig {
  return parseGitHubOAuthConfig(process.env);
}

export const GITHUB_WEBHOOK_SECRET_MIN_LENGTH = 16;

export function parseGitHubWebhookSecret(source: GitHubEnvSource): string {
  const secret = source.GITHUB_WEBHOOK_SECRET?.trim() ?? "";
  if (secret.length < GITHUB_WEBHOOK_SECRET_MIN_LENGTH) {
    throw new AppError({
      userMessage: "GitHub webhook이 아직 설정되지 않았습니다.",
      developerCause: "GITHUB_WEBHOOK_SECRET is missing or shorter than 16 characters",
      code: "GITHUB_WEBHOOK_SECRET_MISSING",
      status: 503,
    });
  }
  return secret;
}

export function isGitHubWebhookConfigured(
  source: GitHubEnvSource = process.env,
): boolean {
  try {
    parseGitHubWebhookSecret(source);
    return true;
  } catch {
    return false;
  }
}

export function getGitHubWebhookSecret(): string {
  return parseGitHubWebhookSecret(process.env);
}
