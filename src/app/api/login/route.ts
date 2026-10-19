import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/password";
import { clearLoginFailures, clientIp, loginLimited, recordLoginFailure } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, sessionCookieSecure, signSession } from "@/lib/session";
import { safeNextPath } from "@/lib/url";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  const password = String(form.get("password") ?? "");
  const nextPath = safeNextPath(typeof form.get("next") === "string" ? String(form.get("next")) : "/");
  const ip = clientIp(req);
  const bucket = `login:${ip}`;
  const limit = loginLimited(bucket);
  if (limit.limited) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "rate");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, { status: 303, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (!expected || !secret || !secretMatches(password, expected)) {
    recordLoginFailure(bucket);
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  clearLoginFailures(bucket);
  const token = await signSession(secret);
  const response = NextResponse.redirect(new URL(nextPath, req.url), 303);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return response;
}
