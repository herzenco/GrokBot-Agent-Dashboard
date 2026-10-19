import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Dashboard JSON routes. The session cookie is the only credential; the browser never sees Supabase. */
export async function requireDashboardSession(): Promise<Response | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const ok = await verifySession(token, process.env.SESSION_SECRET ?? "");
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
