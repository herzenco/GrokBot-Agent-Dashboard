import { requireDashboardSession } from "@/lib/dashboard-session";
import { listAgents, listOutreach } from "@/lib/data";
import { toOutreachView } from "@/lib/outreach";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireDashboardSession();
  if (denied) return denied;
  const [agents, rows] = await Promise.all([listAgents(), listOutreach()]);
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  return Response.json(
    { items: rows.map((row) => toOutreachView(row, byId.get(row.agent_id))) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
