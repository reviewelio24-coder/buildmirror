import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { GitHubEnvSource } from "@/lib/github/config";
import { sanitizeNextPath } from "@/lib/navigation/paths";

export const INSTALL_STATE_TTL_MS = 10 * 60 * 1000;
export const INSTALL_STATE_SECRET_MIN_LENGTH = 32;

export type GitHubStatePurpose = "install" | "user_oauth";

export type GitHubSignedStatePayload = {
  v: 1;
  purpose: GitHubStatePurpose;
  userId: string;
  nonce: string;
  exp: number;
  returnTo: string;
};

export type GitHubInstallStatePayload = GitHubSignedStatePayload;

export function getInstallStateSecret(source: GitHubEnvSource = process.env): string {
  const explicit = source.GITHUB_INSTALL_STATE_SECRET?.trim();
  if (explicit && explicit.length >= INSTALL_STATE_SECRET_MIN_LENGTH) {
    return explicit;
  }
  throw new AppError({
    userMessage: "GitHub App이 아직 설정되지 않았습니다.",
    developerCause: "GITHUB_INSTALL_STATE_SECRET is missing or shorter than 32 characters",
    code: "GITHUB_APP_NOT_CONFIGURED",
    status: 501,
  });
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createInstallState(input: {
  userId: string;
  returnTo: unknown;
  secret: string;
  now?: Date;
  nonce?: string;
}): { state: string; payload: GitHubInstallStatePayload } {
  return createSignedState({ ...input, purpose: "install" });
}

export function createUserOAuthState(input: {
  userId: string;
  returnTo: unknown;
  secret: string;
  now?: Date;
  nonce?: string;
}): { state: string; payload: GitHubSignedStatePayload } {
  return createSignedState({ ...input, purpose: "user_oauth" });
}

function createSignedState(input: {
  userId: string;
  returnTo: unknown;
  secret: string;
  purpose: GitHubStatePurpose;
  now?: Date;
  nonce?: string;
}): { state: string; payload: GitHubSignedStatePayload } {
  const now = input.now ?? new Date();
  const payload: GitHubSignedStatePayload = {
    v: 1,
    purpose: input.purpose,
    userId: input.userId,
    nonce: input.nonce ?? randomUUID(),
    exp: Math.floor((now.getTime() + INSTALL_STATE_TTL_MS) / 1000),
    returnTo: sanitizeNextPath(input.returnTo),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    state: `${encoded}.${signPayload(encoded, input.secret)}`,
    payload,
  };
}

export function verifyInstallState(
  raw: unknown,
  input: { secret: string; userId: string; now?: Date },
): GitHubInstallStatePayload | { error: "invalid" | "expired" | "wrong_user" } {
  return verifySignedState(raw, { ...input, purpose: "install" });
}

export function verifyUserOAuthState(
  raw: unknown,
  input: { secret: string; userId: string; now?: Date },
): GitHubSignedStatePayload | { error: "invalid" | "expired" | "wrong_user" } {
  return verifySignedState(raw, { ...input, purpose: "user_oauth" });
}

function verifySignedState(
  raw: unknown,
  input: { secret: string; userId: string; purpose: GitHubStatePurpose; now?: Date },
): GitHubSignedStatePayload | { error: "invalid" | "expired" | "wrong_user" } {
  if (typeof raw !== "string" || raw.length < 16 || raw.length > 2048) {
    return { error: "invalid" };
  }
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) {
    return { error: "invalid" };
  }
  const encoded = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!encoded || !signature || !signaturesMatch(signature, signPayload(encoded, input.secret))) {
    return { error: "invalid" };
  }

  let payload: GitHubSignedStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as GitHubSignedStatePayload;
  } catch {
    return { error: "invalid" };
  }
  if (
    payload.v !== 1 ||
    payload.purpose !== input.purpose ||
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.returnTo !== "string"
  ) {
    return { error: "invalid" };
  }
  const now = input.now ?? new Date();
  if (payload.exp * 1000 <= now.getTime()) {
    return { error: "expired" };
  }
  if (payload.userId !== input.userId) {
    return { error: "wrong_user" };
  }
  payload.returnTo = sanitizeNextPath(payload.returnTo);
  return payload;
}

export function parseGitHubInstallationId(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const text = String(raw).trim();
  if (!/^[1-9][0-9]{0,15}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export const ALLOWED_SETUP_ACTIONS = ["install", "update", "request"] as const;
export type GitHubSetupAction = (typeof ALLOWED_SETUP_ACTIONS)[number];

export function parseSetupAction(raw: unknown): GitHubSetupAction | null {
  if (typeof raw !== "string") {
    return null;
  }
  return (ALLOWED_SETUP_ACTIONS as readonly string[]).includes(raw)
    ? (raw as GitHubSetupAction)
    : null;
}
