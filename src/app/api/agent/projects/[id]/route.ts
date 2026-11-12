import { authenticate, asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { isUuid } from "@/lib/url";
import { updateProject } from "@/lib/work-db";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Project not found", 404);
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const patch: { name?: string; description?: string | null; slug?: string; archived?: boolean } = {};
  if ("name" in body) {
    const name = asText(body.name, "name", 80, true);
    if (isResponse(name) || !name) return isResponse(name) ? name : jsonError("name is required", 400);
    patch.name = name;
  }
  if ("description" in body) {
    const description = asText(body.description, "description", 2000, false);
    if (isResponse(description)) return description;
    patch.description = description;
  }
  if ("slug" in body) {
    const slug = asText(body.slug, "slug", 60, true);
    if (isResponse(slug) || !slug) return isResponse(slug) ? slug : jsonError("slug is required", 400);
    patch.slug = slug;
  }
  if ("archived" in body) {
    if (typeof body.archived !== "boolean") return jsonError("archived must be true or false", 400);
    patch.archived = body.archived;
  }
  const project = await updateProject(id, patch);
  if ("error" in project) {
    const status = project.error === "Project not found" ? 404 : 400;
    return jsonError(project.error, status);
  }
  return Response.json(project);
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Project not found", 404);
  const project = await updateProject(id, { archived: true });
  if ("error" in project) return jsonError(project.error, project.error === "Project not found" ? 404 : 400);
  return Response.json(project);
}
