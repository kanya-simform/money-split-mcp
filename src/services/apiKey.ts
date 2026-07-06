import { randomBytes, createHash } from "node:crypto";

const API_KEY_PREFIX = "msk_";

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}
