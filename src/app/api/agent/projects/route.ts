import { authenticate, asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { createProject, listProjects } from "@/lib/work-db";

export async function GET(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const projects = await listProjects();
  const archived = new URL(req.url).searchParams.get("archived");
  const visible =
    archived === "true" ? projects : archived === "all" ? projects : projects.filter((project) => !project.archived_at);
  return Response.json({ projects: visible });
}

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const name = asText(body.name, "name", 80, true);
  if (isResponse(name) || !name) return isResponse(name) ? name : jsonError("name is required", 400);
  const description = asText(body.description, "description", 2000, false);
  if (isResponse(description)) return description;
  const slug = asText(body.slug, "slug", 60, false);
  if (isResponse(slug)) return slug;
  const project = await createProject({ name, description, slug });
  if ("error" in project) return jsonError(project.error, 400);
  return Response.json(project, { status: 201 });
}
