"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { setTaskBlockedAction } from "@/app/actions";
import { LiveAvatar } from "@/components/live-status";
import type { BlockedEntry } from "@/lib/blocked";

export function BlockedDetailModal({
  entries,
  heading,
  onClose,
}: {
  entries: BlockedEntry[];
  heading?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const sharedAgent = entries.length > 0 && entries.every((entry) => entry.agentId === entries[0]?.agentId);
  const lead = sharedAgent ? entries[0] : null;
  const title = heading ?? (lead ? `${lead.agentName} is blocked` : "Blocked");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title-row">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {lead ? <AgentBlockHead entry={lead} /> : <p className="modal-lead">What is stuck, why, and what unblocks it.</p>}
        {entries.length === 0 ? (
          <p className="empty">Nothing is blocked right now.</p>
        ) : (
          <div className="block-list">
            {entries.map((entry) => (
              <BlockedEntryView key={entry.id} entry={entry} showAgent={!sharedAgent} onDone={onClose} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentBlockHead({ entry }: { entry: BlockedEntry }) {
  return (
    <div className="block-person">
      <LiveAvatar name={entry.agentName} agentId={entry.agentId} fallback={entry.mood} size={44} />
      <div className="block-person-id">
        <strong>{entry.agentName}</strong>
        <p>{entry.agentRole}</p>
      </div>
      <span className="pill pill-blocked">
        <span className="pill-dot" aria-hidden="true" />
        Blocked
      </span>
    </div>
  );
}

function BlockedEntryView({
  entry,
  showAgent,
  onDone,
}: {
  entry: BlockedEntry;
  showAgent: boolean;
  onDone: () => void;
}) {
  return (
    <article className="block-entry">
      {showAgent ? <AgentBlockHead entry={entry} /> : null}
      <p className="block-kicker">{entry.kicker}</p>
      <section className="block-section">
        <h3>What is blocked</h3>
        <p>{entry.whatBlocked}</p>
      </section>
      <section className="block-section block-why">
        <h3>Why it is blocked</h3>
        <p>{entry.whyBlocked}</p>
      </section>
      <section className="block-section block-need">
        <h3>What is needed to unblock it</h3>
        <p>{entry.unblockNeeded}</p>
      </section>
      {entry.task ? <TaskBlockEditor entry={entry} onDone={onDone} /> : null}
    </article>
  );
}

function TaskBlockEditor({ entry, onDone }: { entry: BlockedEntry; onDone: () => void }) {
  const task = entry.task;
  if (!task) return null;
  return <TaskBlockForm entry={entry} task={task} onDone={onDone} />;
}

function TaskBlockForm({
  entry,
  task,
  onDone,
}: {
  entry: BlockedEntry;
  task: NonNullable<BlockedEntry["task"]>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(task.blockedReason || task.note || "");
  const [needed, setNeeded] = useState(task.unblockNeeded || "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await setTaskBlockedAction(task.id, true, reason, reason, needed);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone();
  }

  async function clearBlock() {
    setPending(true);
    setError(null);
    const result = await setTaskBlockedAction(task.id, false, "");
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <div className="block-edit">
      <div className="modal-actions block-edit-actions">
        <Link href={`/agents/${entry.agentSlug}`} className="btn">
          Open agent queue
        </Link>
        <button type="button" className="btn" disabled={pending} onClick={() => void clearBlock()}>
          Clear block
        </button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => setEditing((open) => !open)}>
          {editing ? "Hide edit" : "Edit block"}
        </button>
      </div>
      {editing ? (
        <form className="stack" onSubmit={(event) => void save(event)}>
          <label className="field">
            Why is it blocked?
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={1000} rows={3} />
          </label>
          <label className="field">
            What is needed to unblock it?
            <textarea value={needed} onChange={(event) => setNeeded(event.target.value)} maxLength={1000} rows={3} />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save block"}
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : null}
    </div>
  );
}

export function BlockedLaunch({
  entries,
  className,
  children,
  heading,
}: {
  entries: BlockedEntry[];
  className?: string;
  children: React.ReactNode;
  heading?: string;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? <BlockedDetailModal entries={entries} heading={heading} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function BlockedStatButton({ count, entries }: { count: number; entries: BlockedEntry[] }) {
  const [open, setOpen] = useState(false);
  const heading = entries.length > 0 ? `Blocked · ${entries.length}` : "Blocked";
  return (
    <>
      <button type="button" className="stat stat-button" onClick={() => setOpen(true)}>
        <span className="stat-label bad">Blocked</span>
        <span className="stat-value bad">{count}</span>
      </button>
      {open ? <BlockedDetailModal entries={entries} heading={heading} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
