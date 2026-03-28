import { createHmac, timingSafeEqual } from "node:crypto";

export type StripeWebhookVerificationResult =
  | { ok: true; timestamp: number }
  | {
      ok: false;
      reason:
        | "missing_webhook_secret"
        | "missing_signature_header"
        | "invalid_signature_header"
        | "signature_outside_tolerance"
        | "signature_mismatch";
    };

function parseStripeSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",").map((p) => p.trim());
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));

  if (!timestampPart || signatures.length === 0) return null;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, signatures };
}

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string | null;
  webhookSecret?: string;
  toleranceSeconds: number;
  nowMs?: number;
}): StripeWebhookVerificationResult {
  if (!input.webhookSecret) {
    return { ok: false, reason: "missing_webhook_secret" };
  }

  if (!input.signatureHeader) {
    return { ok: false, reason: "missing_signature_header" };
  }

  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  if (!parsed) {
    return { ok: false, reason: "invalid_signature_header" };
  }

  const nowMs = input.nowMs ?? Date.now();
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp);
  if (ageSeconds > input.toleranceSeconds) {
    return { ok: false, reason: "signature_outside_tolerance" };
  }

  const signedPayload = `${parsed.timestamp}.${input.payload}`;
  const expected = createHmac("sha256", input.webhookSecret).update(signedPayload).digest("hex");

  const matched = parsed.signatures.some((candidate) => {
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  });

  if (!matched) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true, timestamp: parsed.timestamp };
}

export type StripeWebhookEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: Record<string, unknown>;
  };
};
