import crypto from "node:crypto";
import { env } from "../../config/env";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

type SessionPayload = {
  username: string;
  businessId: string;
  exp: number;
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string): string {
  return crypto
    .createHmac("sha256", env.ADMIN_PANEL_SESSION_SECRET)
    .update(data)
    .digest("base64url");
}

export function createAdminSessionToken(
  username: string,
  businessId: string
): { token: string; expiresAt: string } {
  const payload: SessionPayload = {
    username,
    businessId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export function verifyAdminSessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (!payload?.username || !payload?.businessId || !payload?.exp) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
