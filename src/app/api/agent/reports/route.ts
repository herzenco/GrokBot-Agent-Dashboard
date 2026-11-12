import { noteAgentApiCall } from "@/lib/agent-activity";
import { agentForWrite, asDate, asStringArray, authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { parseReportBlocked } from "@/lib/blocked-payload";
import { upsertReport } from "@/lib/mutations";
import { etTodayISO } from "@/lib/time";

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;
  const reportDate = asDate(body.date ?? body.report_date, etTodayISO());
  if (isResponse(reportDate)) return reportDate;
  const done = asStringArray(body.done, "done");
  if (isResponse(done)) return done;
  const inProgress = asStringArray(body.in_progress, "in_progress");
  if (isResponse(inProgress)) return inProgress;
  const blocked = parseReportBlocked(body.blocked);
  if (!blocked.ok) return jsonError(blocked.error, 400);

  const report = await upsertReport({
    agent,
    reportDate,
    done,
    inProgress,
    blocked: blocked.items,
  });
  await noteAgentApiCall(agent);
  return Response.json(report);
}
