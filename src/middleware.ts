import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/agent")) return NextResponse.next();
  if (pathname === "/api/login") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const ok = await verifySession(token, process.env.SESSION_SECRET ?? "");

  if (pathname === "/login") {
    if (ok) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!ok) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
