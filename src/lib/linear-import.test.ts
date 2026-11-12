import { describe, expect, it } from "vitest";
import { parseLinearIssue, runLinearImport, type ImportTask, type LinearStore, type LinearWrite } from "@/lib/linear-import";

function memoryStore() {
  const tasks = new Map<string, ImportTask>();
  let seq = 0;
  const projects = new Map<string, { id: string; name: string }>();
  const links: { taskId: string; url: string }[] = [];
  const store: LinearStore = {
    async findByLinearId(linearId) {
      return [...tasks.values()].find((task) => task.linearId === linearId) ?? null;
    },
    async insert(row: LinearWrite) {
      seq += 1;
      const task: ImportTask = { ...row, id: `task-${seq}`, identifier: `HQ-${seq}` };
      tasks.set(task.id, task);
      return task;
    },
    async update(id, row) {
      const existing = tasks.get(id);
      const task: ImportTask = { ...row, id, identifier: existing?.identifier ?? null };
      tasks.set(id, task);
      return task;
    },
    async ensureProject(name) {
      const found = [...projects.values()].find((project) => project.name === name);
      if (found) return found;
      const project = { id: `project-${projects.size + 1}`, name };
      projects.set(project.id, project);
      return project;
    },
    async setLabels(taskId, names) {
      const task = tasks.get(taskId);
      if (task) task.labels = names;
    },
    async ensureLink(taskId, url) {
      if (!links.some((link) => link.taskId === taskId && link.url === url)) links.push({ taskId, url });
    },
  };
  return { store, tasks, links, projects };
}

const agents = [
  { id: "roger-id", slug: "roger", name: "Roger" },
  { id: "r5-id", slug: "r5-d4", name: "R5-D4" },
];

describe("Linear import", () => {
  it("reads a Linear-shaped issue", () => {
    const parsed = parseLinearIssue(
      {
        identifier: "ENG-12",
        title: "Ship the board",
        description: "Replace the queue",
        state: { name: "In Progress", type: "started" },
        priority: 2,
        labels: [{ name: "Launch" }],
        project: { name: "Agent HQ" },
        assignee: { name: "R5-D4" },
        dueDate: "2026-11-20",
        url: "https://linear.app/herzen/issue/ENG-12",
        parent: { identifier: "ENG-1" },
      },
      0,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft).toMatchObject({
      linearId: "ENG-12",
      status: "in_progress",
      priority: "high",
      labels: ["Launch"],
      projectName: "Agent HQ",
      assigneeName: "R5-D4",
      dueOn: "2026-11-20",
      parentLinearId: "ENG-1",
    });
  });

  it("upserts by Linear identifier and links a parent in the same batch", async () => {
    const memory = memoryStore();
    const issues = [
      {
        identifier: "ENG-2",
        title: "Child",
        state: "Todo",
        priority: "Low",
        parent: "ENG-1",
        assignee: "Roger",
        url: "https://linear.app/herzen/issue/ENG-2",
      },
      {
        identifier: "ENG-1",
        title: "Parent",
        state: "Backlog",
        priority: 0,
        assignee: "Herzen Cortes",
        project: "Agent HQ",
      },
    ];
    const first = await runLinearImport(issues, memory.store, agents, "roger-id");
    expect(first.created).toBe(2);
    expect(first.errors).toEqual([]);
    const child = [...memory.tasks.values()].find((task) => task.linearId === "ENG-2");
    const parent = [...memory.tasks.values()].find((task) => task.linearId === "ENG-1");
    expect(child?.parentId).toBe(parent?.id);
    expect(child?.agentId).toBe("roger-id");
    expect(parent?.assigneeHerzen).toBe(true);
    expect(parent?.projectId).toBe("project-1");
    expect(memory.links).toEqual([{ taskId: child?.id, url: "https://linear.app/herzen/issue/ENG-2" }]);

    const second = await runLinearImport(issues, memory.store, agents, "roger-id");
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(2);
    expect(memory.tasks.size).toBe(2);
  });
});
