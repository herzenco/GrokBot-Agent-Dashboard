import { requireDashboardSession } from "@/lib/dashboard-session";
import { listActivity, listAgentStatus, listAgents } from "@/lib/data";
import { STALE_AFTER_MS, presentLiveStatus } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDashboardSession();
  if (denied) return denied;
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(now.getTime() + 60_000).toISOString();
  const [agents, rows, activity] = await Promise.all([
    listAgents(),
    listAgentStatus(),
    listActivity(since, until),
  ]);
  return Response.json(
    {
      now: now.toISOString(),
      stale_after_ms: STALE_AFTER_MS,
      agents: presentLiveStatus(agents, rows, now, activity),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
