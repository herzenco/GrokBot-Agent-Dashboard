"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { setTaskBlockedAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { ResolutionBox } from "@/components/resolution-box";
import { NOT_PROVIDED, blockedDetailFields, type BlockedDetailView, type BlockedEntry } from "@/lib/blocked";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sharedAgent = entries.length > 0 && entries.every((entry) => entry.agentId === entries[0]?.agentId);
  const lead = sharedAgent ? entries[0] : null;
  const title = heading ?? (lead ? `${lead.agentName} is blocked` : "Blocked");

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => !node.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title-row">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
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
  const agent = blockedDetailFields(entry).agent;
  return (
    <div className="block-person">
      <Avatar name={entry.agentName || agent} mood={entry.mood} size={44} />
      <div className="block-person-id">
        <strong>{agent}</strong>
        <p>{entry.agentRole.trim() || NOT_PROVIDED}</p>
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
  const fields = blockedDetailFields(entry);
  return (
    <article className="block-entry">
      {showAgent ? <AgentBlockHead entry={entry} /> : null}
      <p className="block-kicker">{entry.kicker}</p>
      <BlockField title="What is blocked" value={fields.item} />
      <BlockField title="Why it is blocked" value={fields.reason} tone="why" />
      <BlockField title="Waiting on" value={fields.waitingOn} tone="need" />
      <BlockField title="Reported" value={fields.reportedAt} />
      <SourceField fields={fields} />
      <BlockField title="What is needed to unblock it" value={fields.unblockNeeded} />
      {entry.task ? (
        <ResolutionBox taskId={entry.task.id} state={entry.resolutionState ?? "none"} canPost />
      ) : null}
      {entry.task ? <TaskBlockEditor entry={entry} onDone={onDone} /> : null}
    </article>
  );
}

function BlockField({ title, value, tone }: { title: string; value: string; tone?: "why" | "need" }) {
  const missing = value === NOT_PROVIDED;
  return (
    <section className={tone ? `block-section block-${tone}` : "block-section"}>
      <h3>{title}</h3>
      <p className={missing ? "block-missing" : undefined}>{value}</p>
    </section>
  );
}

function SourceField({ fields }: { fields: BlockedDetailView }) {
  return (
    <section className="block-section block-source">
      <h3>Source</h3>
      {fields.sourceHref ? (
        fields.sourceHref.startsWith("/") ? (
          <p>
            <Link href={fields.sourceHref}>{fields.sourceLabel}</Link>
          </p>
        ) : (
          <p>
            <a href={fields.sourceHref} target="_blank" rel="noopener noreferrer">
              {fields.sourceLabel}
            </a>
          </p>
        )
      ) : (
        <p className="block-missing">{NOT_PROVIDED}</p>
      )}
    </section>
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
  dataTail,
}: {
  entries: BlockedEntry[];
  className?: string;
  children: React.ReactNode;
  heading?: string;
  dataTail?: string;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        data-tail={dataTail}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
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
      <button type="button" className="stat stat-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="stat-label bad">Blocked</span>
        <span className="stat-value bad">{count}</span>
      </button>
      {open ? <BlockedDetailModal entries={entries} heading={heading} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
