"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTaskAction } from "@/app/actions";
import type { ShellAgent } from "@/components/shell";

export function NewTaskModal({ agents, onClose }: { agents: ShellAgent[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [priority, setPriority] = useState("normal");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createTaskAction({ title, details, agentId, priority });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="new-task-title">New task</h2>
        <p className="modal-lead">It lands in To do and shows up on the activity feed.</p>
        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus maxLength={200} />
          </label>
          <label className="field">
            Details
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} maxLength={5000} placeholder="Optional" />
          </label>
          <div className="field-row">
            <label className="field">
              Agent
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} required>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || agents.length === 0}>
              {pending ? "Saving…" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
