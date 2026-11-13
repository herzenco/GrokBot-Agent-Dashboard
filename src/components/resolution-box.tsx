"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listTaskResolutionsAction, postResolutionAction } from "@/app/work-actions";
import { formatEtDateTime } from "@/lib/time";
import type { ResolutionState } from "@/lib/types";

export type ResolutionItem = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

export function AwaitingAgentBadge() {
  return <span className="resolution-badge">Awaiting agent</span>;
}

export function ResolutionBox({
  taskId,
  resolutions,
  state = "none",
  acknowledgedAt = null,
  canPost = false,
}: {
  taskId: string;
  resolutions?: ResolutionItem[];
  state?: ResolutionState;
  acknowledgedAt?: string | null;
  canPost?: boolean;
}) {
  const router = useRouter();
  const provided = resolutions !== undefined;
  const [items, setItems] = useState<ResolutionItem[] | null>(resolutions ?? null);
  const [phase, setPhase] = useState<ResolutionState>(state);
  const [ackedAt, setAckedAt] = useState<string | null>(acknowledgedAt);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (provided) return;
    let cancel = false;
    void listTaskResolutionsAction(taskId).then((result) => {
      if (cancel) return;
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        return;
      }
      setItems(result.resolutions);
      setPhase(result.state);
      setAckedAt(result.acknowledgedAt);
    });
    return () => {
      cancel = true;
    };
  }, [taskId, provided]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await postResolutionAction(taskId, text);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((current) => [...(current ?? []), result.resolution]);
    setPhase("awaiting_agent");
    setAckedAt(null);
    setText("");
    router.refresh();
  }

  const history = items ?? [];
  const ackedLabel = ackedAt ? formatEtDateTime(new Date(ackedAt)) : null;

  return (
    <div className="resolution-box">
      {phase === "awaiting_agent" ? <AwaitingAgentBadge /> : null}
      {phase === "acknowledged" && ackedLabel ? <p className="quiet-line">Acknowledged {ackedLabel}</p> : null}
      <h3>Resolution history</h3>
      {items === null ? <p className="empty">Loading resolutions…</p> : null}
      {items !== null && history.length === 0 ? <p className="empty">No resolution yet.</p> : null}
      {history.length > 0 ? (
        <ol className="resolution-history">
          {history.map((item) => (
            <li key={item.id} className="resolution-note">
              <strong>Herzen</strong>
              <p>{item.body}</p>
              <p className="quiet-line">{formatEtDateTime(new Date(item.created_at))}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {canPost ? (
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            Resolution
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={8000}
              required
              placeholder="Tell the agent how to close this block"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : null}
    </div>
  );
}
