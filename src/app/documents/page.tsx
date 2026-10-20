import Link from "next/link";
import { ActivityPanel } from "@/components/activity-panel";
import { Avatar } from "@/components/avatar";
import { Shell, Split } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { listDocumentEvents, listDocuments } from "@/lib/data";
import { documentAgentName } from "@/lib/documents";
import { formatEtDateTime } from "@/lib/time";
import { safeHref } from "@/lib/url";

export default async function DocumentsPage() {
  const [chrome, documents, events] = await Promise.all([loadChrome(), listDocuments(), listDocumentEvents()]);
  const agentsById = new Map(chrome.agents.map((agent) => [agent.id, agent]));
  const latest = new Map<string, (typeof events)[number]>();
  for (const event of events) latest.set(event.document_id, event);

  return (
    <Shell active="documents" agents={chrome.agents}>
      <p className="dateline">Audit trail</p>
      <h1 className="greeting page-title">Documents</h1>
      <p className="subhead">Vault paths and who changed them. Agent HQ never reads the files.</p>
      <Split
        main={
          documents.length === 0 ? (
            <p className="empty">No documents logged yet.</p>
          ) : (
            <ul className="doc-list">
              {documents.map((document) => {
                const event = latest.get(document.id);
                const agent = event ? agentsById.get(event.agent_id) : undefined;
                const agentName = documentAgentName(chrome.agents, event?.agent_id);
                const href = safeHref(document.url);
                return (
                  <li key={document.id} className="doc-row">
                    <Link href={`/documents/${document.id}`} className="doc-main">
                      <span className="doc-title">{document.title}</span>
                      <code className="doc-path">{document.vault_path}</code>
                      <span className="doc-meta">
                        {agent ? <Avatar name={agent.name} mood={chrome.moods.get(agent.id) ?? "active"} size={22} /> : null}
                        <span>{agentName}</span>
                        <span>{formatEtDateTime(new Date(document.last_changed_at))}</span>
                      </span>
                    </Link>
                    {href ? (
                      <a className="doc-open" href={href} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      <span className="quiet-line">No link</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}
