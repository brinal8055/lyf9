import { createHmac, timingSafeEqual } from "crypto";

export type SignedUrlAction = "upload" | "download";

export type SignedUrlPayload = {
  action: SignedUrlAction;
  expiresAt: number;
  reportFileId: string;
  storageKey: string;
  userId: string;
};

export function createSignedToken(payload: SignedUrlPayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedToken(
  token: string | null,
  action: SignedUrlAction,
  secret: string
) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SignedUrlPayload;

    if (payload.action !== action || payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getReportSigningSecret() {
  return process.env.LYF9_REPORT_URL_SECRET ?? "lyf9-local-report-url-secret";
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}
