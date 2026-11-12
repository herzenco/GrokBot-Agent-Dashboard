"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveProjectAction, saveProjectAction } from "@/app/work-actions";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  archived_at: string | null;
};

export function ProjectPanel({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="detail-card">
      <h2>Projects</h2>
      <ul className="check-list">
        {projects.map((project) => (
          <li key={project.id}>
            {editing === project.id ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void saveProjectAction({
                    id: project.id,
                    name: String(form.get("name") ?? ""),
                    description: String(form.get("description") ?? ""),
                  }).then((result) => {
                    if (!result.ok) setError(result.error);
                    else {
                      setEditing(null);
                      router.refresh();
                    }
                  });
                }}
              >
                <input name="name" defaultValue={project.name} required maxLength={80} />
                <input name="description" defaultValue={project.description ?? ""} maxLength={2000} />
                <button type="submit" className="btn">
                  Save
                </button>
              </form>
            ) : (
              <>
                <strong>{project.name}</strong>
                <span className="quiet-line"> {project.slug}</span>
                {project.archived_at ? <span className="quiet-line"> archived</span> : null}
                <button type="button" className="text-btn" onClick={() => setEditing(project.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    void archiveProjectAction(project.id, !project.archived_at).then((result) => {
                      if (!result.ok) setError(result.error);
                      else router.refresh();
                    });
                  }}
                >
                  {project.archived_at ? "Restore" : "Archive"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void saveProjectAction({
            name: String(form.get("name") ?? ""),
            description: String(form.get("description") ?? ""),
          }).then((result) => {
            if (!result.ok) setError(result.error);
            else {
              event.currentTarget.reset();
              router.refresh();
            }
          });
        }}
      >
        <div className="field-row">
          <label className="field">
            New project
            <input name="name" required maxLength={80} placeholder="Name" />
          </label>
          <label className="field">
            Description
            <input name="description" maxLength={2000} placeholder="Optional" />
          </label>
        </div>
        <button type="submit" className="btn">
          Create project
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
