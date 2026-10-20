import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { Avatar } from "@/components/avatar";
import { Shell, Split } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { getDocument, listDocumentEvents } from "@/lib/data";
import { documentAgentName } from "@/lib/documents";
import { formatEtDateTime } from "@/lib/time";
import { isUuid, safeHref } from "@/lib/url";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [chrome, document, events] = await Promise.all([loadChrome(), getDocument(id), listDocumentEvents(id)]);
  if (!document) notFound();
  const agentsById = new Map(chrome.agents.map((agent) => [agent.id, agent]));
  const href = safeHref(document.url);

  return (
    <Shell active="documents" agents={chrome.agents}>
      <p className="dateline">
        <Link href="/documents">Documents</Link>
        <span aria-hidden="true"> / </span>
        History
      </p>
      <h1 className="greeting page-title">{document.title}</h1>
      <p className="doc-path standalone">{document.vault_path}</p>
      <p className="subhead">
        Last change {formatEtDateTime(new Date(document.last_changed_at))}
        {href ? (
          <>
            {" "}
            <a href={href} target="_blank" rel="noreferrer">
              Open link
            </a>
          </>
        ) : null}
      </p>
      <Split
        main={
          <ol className="timeline">
            {events.map((event) => {
              const agent = agentsById.get(event.agent_id);
              const agentName = documentAgentName(chrome.agents, event.agent_id);
              return (
                <li key={event.id} className="event">
                  {agent ? <Avatar name={agent.name} mood={chrome.moods.get(agent.id) ?? "active"} size={36} /> : <span className="tito-mark">?</span>}
                  <div>
                    <div className="event-line">
                      <strong>{agentName}</strong>
                      <span className={`event-action action-${event.action}`}>{event.action}</span>
                    </div>
                    <p>{event.change_summary}</p>
                    {event.from_path ? <p className="doc-path">From {event.from_path}</p> : null}
                    <p className="activity-time">{formatEtDateTime(new Date(event.created_at))}</p>
                  </div>
                </li>
              );
            })}
            {events.length === 0 ? <li className="empty">No events recorded.</li> : null}
          </ol>
        }
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}
