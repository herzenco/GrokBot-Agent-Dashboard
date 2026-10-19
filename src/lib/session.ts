export const SESSION_COOKIE = "ahq_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

type SessionPayload = { v: 1; exp: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(secret: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = { v: 1, exp: now + SESSION_MAX_AGE_SEC * 1000 };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(sig);
  } catch {
    return false;
  }
  const key = await hmacKey(secret);
  const signature = new ArrayBuffer(sigBytes.byteLength);
  new Uint8Array(signature).set(sigBytes);
  const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(body));
  if (!valid) return false;
  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(body))) as SessionPayload;
    return payload.v === 1 && typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

export function sessionCookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}
