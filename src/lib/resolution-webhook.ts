import "server-only";
import { createHmac } from "node:crypto";

export type ResolutionWebhookPayload = {
  event: "resolution.created";
  task_id: string;
  identifier: string | null;
  agent: string | null;
  title: string;
  blocked_reason: string | null;
  resolution: {
    id: string;
    author: string;
    body: string;
    created_at: string;
  };
};

/** HMAC-SHA256 hex of the exact JSON body. Header value is `sha256=<hex>`. */
export function signResolutionBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Best-effort push. No-op unless both RESOLUTION_WEBHOOK_URL and
 * RESOLUTION_WEBHOOK_SECRET are set. Failures never block the resolution save.
 */
export async function notifyResolutionWebhook(payload: ResolutionWebhookPayload): Promise<boolean> {
  const url = process.env.RESOLUTION_WEBHOOK_URL?.trim() ?? "";
  const secret = process.env.RESOLUTION_WEBHOOK_SECRET?.trim() ?? "";
  if (!url || !secret) return false;
  const body = JSON.stringify(payload);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-resolution-signature": `sha256=${signResolutionBody(body, secret)}`,
      },
      body,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return false;
  }
  return true;
}
