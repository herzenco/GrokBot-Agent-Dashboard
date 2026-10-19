import { requireDashboardSession } from "@/lib/dashboard-session";
import { loadChrome } from "@/lib/chrome";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDashboardSession();
  if (denied) return denied;
  const { activity } = await loadChrome();
  return Response.json({ items: activity }, { headers: { "Cache-Control": "no-store" } });
}
