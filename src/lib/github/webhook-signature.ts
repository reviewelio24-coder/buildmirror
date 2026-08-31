import { createHmac, timingSafeEqual } from "node:crypto";

export function createGitHubWebhookSignature(
  secret: string,
  rawBody: Buffer,
): string {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

function equalBuffers(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyGitHubWebhookSignature(input: {
  secret: string;
  rawBody: Buffer;
  signatureHeader: string | null | undefined;
}): boolean {
  const header = input.signatureHeader?.trim() ?? "";
  if (!header.startsWith("sha256=")) {
    return false;
  }
  const expected = createGitHubWebhookSignature(input.secret, input.rawBody);
  return equalBuffers(Buffer.from(expected), Buffer.from(header));
}
