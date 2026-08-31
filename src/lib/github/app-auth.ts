import { createPrivateKey, sign } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { GitHubAppConfig } from "@/lib/github/config";

const JWT_TTL_SECONDS = 10 * 60;
const JWT_IAT_SKEW_SECONDS = 60;

export type GitHubAppJwtClaims = {
  iat: number;
  exp: number;
  iss: string;
};

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createAppJwt(
  config: GitHubAppConfig,
  now = new Date(),
): { token: string; claims: GitHubAppJwtClaims } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: GitHubAppJwtClaims = {
    iat: issuedAt - JWT_IAT_SKEW_SECONDS,
    exp: issuedAt + JWT_TTL_SECONDS,
    iss: config.clientId,
  };

  const header = toBase64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = toBase64UrlJson(claims);
  const unsigned = `${header}.${payload}`;

  let signature: Buffer;
  try {
    const key = createPrivateKey(config.privateKey);
    signature = sign("sha256", Buffer.from(unsigned), key);
  } catch (error) {
    throw new AppError({
      userMessage: "GitHub App 비공개 키를 읽지 못했습니다.",
      developerCause:
        error instanceof Error ? error.message : "createPrivateKey/sign failed",
      code: "GITHUB_APP_PRIVATE_KEY_INVALID",
      status: 500,
    });
  }

  return {
    token: `${unsigned}.${signature.toString("base64url")}`,
    claims,
  };
}
