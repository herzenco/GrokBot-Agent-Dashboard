import { requireDashboardSession } from "@/lib/dashboard-session";
import { listAgentStatus, listAgents } from "@/lib/data";
import { STALE_AFTER_MS, presentLiveStatus } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDashboardSession();
  if (denied) return denied;
  const now = new Date();
  const [agents, rows] = await Promise.all([listAgents(), listAgentStatus()]);
  return Response.json(
    {
      now: now.toISOString(),
      stale_after_ms: STALE_AFTER_MS,
      agents: presentLiveStatus(agents, rows, now),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
