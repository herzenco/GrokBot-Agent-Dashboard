# Agent HQ

Private dashboard where Tito runs his eight agents. The board, queues, daily reports, and document audit trail all read from Supabase. Agents write through a small JSON API. The app never opens the Obsidian vault and never stores file contents.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the env file and fill it in:

```bash
cp .env.example .env.local
```

3. Apply the SQL in `supabase/migrations` in filename order. In the dashboard, open the SQL editor and run each file. With the Supabase CLI, from this repo:

```bash
supabase db push
```

`20261019120000_init.sql` creates the board. `20261019180000_agent_heartbeats.sql` adds the live heartbeat tables. `20261020120000_agent_last_active.sql` adds `agents.last_active`. `20261020140000_document_event_from_path.sql` adds `document_events.from_path`. `20261021140000_outreach.sql` adds the `outreach` table. `20261026163500_blocked_details_columns.sql` and `20261112140000_blocked_waiting_and_source.sql` add the block detail columns. `20261112210000_work_tracking.sql` adds projects, labels, durable links, comments, block history, external refs, and stable `HQ-` task numbers. It also rewrites existing `doing` rows to `in_progress` and `normal` priority to `medium`. `20261113150000_task_resolutions.sql` adds resolution comments and the awaiting-agent fields. The later files insert no sample rows and no agent or API key. Apply them before using live status, document moves, outreach, or the Work tab. This repo does not apply them for you. Apply `20261112210000_work_tracking.sql` and `20261113150000_task_resolutions.sql` before deploying the app that reads the new columns.

4. Start the app:

```bash
npm run dev
```

5. Open http://localhost:3000 and sign in with `DASHBOARD_PASSWORD`.

The migration seeds the eight agents plus the tasks, reports, and activity from the approved board (Monday 19 October 2026, America/New_York). On later days those done items and reports stay in the database, and the board only counts the current Eastern Time day.

## Environment variables

Set these in `.env.local` for local dev and in the Vercel project for production. Do not prefix any of them with `NEXT_PUBLIC_`. The browser never talks to Supabase.

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. Server only. Bypasses row level security. |
| `DASHBOARD_PASSWORD` | Password for the login form |
| `SESSION_SECRET` | HMAC secret for the session cookie. Use a long random value (`openssl rand -base64 32`). |
| `ADMIN_API_KEY` | Admin agent API key. May act for any agent. Use a long random value. |
| `RESOLUTION_WEBHOOK_URL` | Optional. Where to POST a new resolution. Unset means agents poll. |
| `RESOLUTION_WEBHOOK_SECRET` | Optional. HMAC secret for that POST. Both must be set or the webhook is skipped. |

The session cookie is httpOnly, SameSite=Lax, and valid for 30 days. In production it is also marked Secure. Login attempts are limited to 8 failures per IP per 15 minutes, in memory on each server instance.

## Database

Tables: `agents`, `tasks`, `reports`, `activity`, `documents`, `document_events`, `agent_status`, `agent_heartbeats`, `outreach`, `projects`, `labels`, `task_labels`, `task_links`, `task_comments`, `task_block_events`.

`agent_status` keeps the latest explicit status for each agent. `agent_heartbeats` stores every status post. Those timestamps are set by the database, not by the client.

`agents.last_active` is the server time of the last successful agent write: a report, a task create or update, a comment, a link, a document event, an outreach create or update, or a status post (including a heartbeat). Reads do not move it. The board treats that column as the agent’s effective presence:

- A write in the last 10 minutes (`RECENT_ACTIVITY_MS`) shows the agent as working, even when the last posted state is idle. A posted `working` state shows its `working_on` text. Otherwise the card shows the latest activity line, or “Active”.
- An idle status post by itself does not count as that fresh work. A later write does.
- A posted `working` state older than 30 minutes (`POSTED_WORKING_MS`), with no newer write, shows as idle or napping.
- A posted `blocked` state stays blocked until the agent posts a different state. The card shows how long it has been blocked.
- Within 2 hours the time line says “Active 4 min ago”. After 2 hours it says “Last active 5 h ago”. That mark is `STALE_AFTER_MS`.

All three durations live in `src/lib/live.ts`. The home board, agent pages, reports, documents, activity-feed avatars, speech bubbles, and the working / stuck / napping counts all use this effective state. Signed-in pages poll `GET /api/live/status` about every 10 seconds and update in place.

Hondo and Frick use the same card portraits as the other agents when their names are Hondo and Frick. Hondo is the pirate. Frick is the inspector with a magnifying glass. Their agent rows are not seeded here. C3PO (slug `c3po`, already in the live agents table) uses a gold tile and the letter fallback, because there is no portrait drawing for that agent.

Row level security is enabled on every table and there are no policies. The anon and authenticated roles have their table privileges revoked. Only the service role, used by the Next.js server, can read and write. Agent API keys are stored as SHA-256 hashes on `agents.api_key_hash`.

`documents` is an audit log: title, vault path, optional link, and a history of created / edited / moved / archived events. The app does not read vault files. `document_events.from_path` stores the previous vault path on a moved event and is null for every other action.

`outreach` is the prospecting log. Hondo (`hondo`, role Outbound Prospecting) is the agent who writes it. His `agents` row and API key are inserted outside the migrations. The Outreach tab lists every row for a signed-in user and refreshes about every 10 seconds.

## API keys

Generate one key per agent. The command prints SQL `UPDATE` statements and the plaintext keys to the terminal. It does not write them into the repo.

```bash
npm run keys:generate
```

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (or present in `.env.local`), the script reads the current agent slugs. Otherwise it uses the eight seeded slugs. Run the printed SQL in Supabase, and keep the plaintext keys somewhere outside this repository.

An agent key can only see and change that agent's tasks, documents, outreach, and status. `ADMIN_API_KEY` can act for any agent. Pass the agent slug in the JSON body (`agent`) or, for a list, as `?agent=`.

## Agent API

Send `Authorization: Bearer <key>` and `Content-Type: application/json`.

### Post a daily report

Reposting the same agent and date overwrites the previous report. `date` is optional and defaults to today in America/New_York.

```bash
curl -s -X POST http://localhost:3000/api/agent/reports \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "done": ["Morning brief sent"],
    "in_progress": ["Weekly priorities memo for Tito"],
    "blocked": []
  }'
```

`blocked` is an array. Each item is either a string (existing agents) or an object. Strings stay limited to 300 characters. Object fields are limited to 1000 characters, and `source_url` must be `http` or `https`.

```bash
curl -s -X POST http://localhost:3000/api/agent/reports \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "done": ["Morning brief sent"],
    "in_progress": ["Weekly priorities memo for Tito"],
    "blocked": [
      "Payroll export on hold per Herzen",
      {
        "title": "herzenco-audits PRs #10, #11, #12",
        "reason": "Review pending",
        "waiting_on": "Herzen",
        "source_url": "https://github.com/herzen-co/audits/pull/10",
        "source_label": "GitHub PR"
      }
    ]
  }'
```

`title` is required on an object. `reason`, `waiting_on`, `source_url`, and `source_label` are optional. A missing field is stored as null and the dashboard shows "Not provided". Reposting the same agent and date still overwrites the previous report.

Admin, acting as Chopper:

```bash
curl -s -X POST http://localhost:3000/api/agent/reports \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "chopper",
    "date": "2026-10-19",
    "done": ["5 audit outreach emails"],
    "in_progress": ["Audit report: Coral Gables dental"],
    "blocked": []
  }'
```

### How agents track work

Herzen uses the password-protected Work tab (`/work`): a board by status, a filterable list, and a task page for edits, comments, links, and the activity log. Times on that tab are America/Cancun. Agents keep posting to `/api/agent` with their own keys.

1. Create the task. The response includes a stable id such as `HQ-123`. That number does not change.
2. Move it by sending `status`. `doing` is still accepted and stored as `in_progress`.
3. When something is stuck, send `blocked: true` and a note. Those block fields still clear when the block ends or the task is done or canceled. The previous block is kept in `block_history`.
4. Put the PR, issue, doc, or deploy on `links`. Those rows stay when the block clears.
5. Comment on the task. The activity log records who changed what.
6. When Herzen posts a resolution on a blocked task, poll `GET /api/agent/resolutions` and acknowledge it. See `docs/resolutions.md`.

`priority` is `none`, `low`, `medium`, `high`, or `urgent`. `normal` is still accepted and stored as `medium`. Omit it and the task is medium.

### List tasks

An agent key returns that agent's tasks. An admin key returns every task, or one agent when `?agent=` is set. Optional filters: `status` (`doing` matches in progress), `priority` (`normal` matches medium), `project` (slug, name, or id), `label`, `blocked` (`true` or `false`), `resolution` (`pending`), `assignee` (`herzen` or an agent slug), `parent` (`HQ-123` or a task id), and `q` (identifier, title, description, Linear id, or `bc-` cloud agent id). `resolution=pending` adds `pending_resolution` (`id`, `author`, `body`, `kind`, `created_at`) on each task.

```bash
curl -s http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ROGER_KEY"

curl -s "http://localhost:3000/api/agent/tasks?agent=ap-5&status=in_progress&blocked=true&q=HQ-12" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Each task includes `identifier`, `project`, `assignee`, `labels`, `links`, `external_refs`, `due_on`, and `parent`. `GET /api/agent/tasks/HQ-123` (or the uuid) also returns `comments`, `activity`, `block_history`, and `subtasks`.

### Create a task

Omitted `status` starts in To do. You can also send `backlog`, `todo`, `in_progress`, `in_review`, `done`, or `canceled`. `doing` is stored as `in_progress`. Priority defaults to `medium`. A new task can include the same block fields as an update (`blocked`, `blocked_note`, `blocked_reason`, `unblock_needed`, `waiting_on`, `source_url`). Optional: `project` (slug or id), `assignee` (`herzen` or an agent slug), `due_on` (`YYYY-MM-DD`), `parent` (`HQ-123` or a task id), `labels` (names), `links` (`[{ "kind": "pr", "url": "https://..." }]`), and `external_refs` or the shortcuts `linear_id`, `linear_url`, and `cloud_agent_id` (`bc-...`).

A `source_url` is still stored on the block and cleared with it. The same URL is also saved as a durable link.

```bash
curl -s -X POST http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Call the printer","details":"Menus for Friday","priority":"high"}'
```

Old payload, still accepted:

```bash
curl -s -X POST http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent":"yoda","title":"Outline November essay","status":"doing","priority":"normal","blocked":true,"blocked_note":"Waiting on the draft"}'
```

### Update a task

Send only the fields that change. `PATCH /api/agent/tasks/HQ-123` and `PATCH /api/agent/tasks/TASK_UUID` are the same route. Status is `backlog`, `todo`, `in_progress`, `in_review`, `done`, or `canceled`. `doing` maps to `in_progress`. Moving a task to done or canceled clears a block. Marking it blocked requires `blocked_note` or `blocked_reason`. Optional block fields, each 1000 characters or fewer:

| Field | Notes |
| --- | --- |
| `blocked_reason` | Why it is blocked. If `blocked_note` is omitted, the reason is copied into the note. |
| `unblock_needed` | What unblocks it. Kept for existing agents. |
| `waiting_on` | Who or what it is waiting on. If this is set and `unblock_needed` is omitted, `unblock_needed` is set to the same text. |
| `source_url` | `http` or `https` link for the block. Also saved as a durable link. |

Clearing the block, or moving the task to done or canceled, clears `blocked_note`, `blocked_reason`, `unblock_needed`, `waiting_on`, and `source_url`. The link row and the block history remain. If a resolution is still awaiting the agent, clearing the block acknowledges it. Only the admin key can set `agent` to a different slug. `DELETE /api/agent/tasks/HQ-123` cancels the task and keeps its comments, links, and history.

```bash
curl -s -X PATCH http://localhost:3000/api/agent/tasks/HQ-123 \
  -H "Authorization: Bearer $AP5_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_review",
    "blocked": true,
    "blocked_note": "Waiting on Skydeo admin",
    "blocked_reason": "Admin has not approved the export",
    "waiting_on": "Skydeo admin",
    "unblock_needed": "Approval from Skydeo admin",
    "source_url": "https://github.com/herzen-co/audits/pull/4",
    "cloud_agent_id": "bc-abc123"
  }'
```

### Resolutions

Herzen posts these from the blocked-item detail. They are `task_comments` rows with `kind: "resolution"` and `author: "herzen"`. Poll the pending list from an agent routine. `GET /api/agent/resolutions` is the same data in a short shape. An agent key sees only its own tasks. The admin key sees every agent, or one agent with `?agent=`.

```bash
curl -s "http://localhost:3000/api/agent/tasks?resolution=pending" \
  -H "Authorization: Bearer $ROGER_KEY"

curl -s http://localhost:3000/api/agent/resolutions \
  -H "Authorization: Bearer $ROGER_KEY"
```

```json
{
  "agent": "roger",
  "resolutions": [
    {
      "task_id": "33333333-3333-4333-8333-333333333333",
      "identifier": "HQ-12",
      "title": "Ship the board",
      "agent": "roger",
      "blocked": true,
      "blocked_reason": "DNS still pending",
      "resolution_state": "awaiting_agent",
      "latest_resolution_at": "2026-11-13T19:05:00.000Z",
      "resolution": {
        "id": "44444444-4444-4444-8444-444444444444",
        "author": "herzen",
        "body": "Use the sandbox key and retry the export.",
        "kind": "resolution",
        "created_at": "2026-11-13T19:05:00.000Z"
      }
    }
  ]
}
```

Acknowledge with `POST /api/agent/tasks/HQ-12/resolution/ack`. `reply` is an optional comment. `blocked: false` and `status` are optional and use the same task update as `PATCH`. Unblocking, or moving the task to done or canceled, acknowledges a pending resolution even when this endpoint is not called.

```bash
curl -s -X POST http://localhost:3000/api/agent/tasks/HQ-12/resolution/ack \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reply":"Using the sandbox key.","blocked":false,"status":"in_progress"}'
```

The response is the task (same fields as `GET /api/agent/tasks/HQ-12`) plus `acknowledged` and `reply`. `reply` is the comment object, or `null`.

### Projects, comments, and links

Any agent key can create and edit projects. `DELETE /api/agent/projects/PROJECT_ID` archives the project. Tasks stay.

```bash
curl -s -X POST http://localhost:3000/api/agent/projects \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Agent HQ","description":"The board that replaces Linear"}'

curl -s -X POST http://localhost:3000/api/agent/tasks/HQ-123/comments \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"Filed the draft."}'

curl -s -X POST http://localhost:3000/api/agent/tasks/HQ-123/links \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"pr","url":"https://github.com/herzen-co/audits/pull/4","label":"Audits PR"}'
```

`kind` is `pr`, `issue`, `doc`, `deploy`, or `other`. Comment and link updates use `PATCH` on `.../comments/COMMENT_ID` and `.../links/LINK_ID`. `DELETE` removes that comment or link. An agent key can only change its own comments. The admin key can change any of them.

### Import Linear issues

`POST /api/agent/import/linear` takes the admin key and a JSON array. It does not call Linear. Each object can include `identifier`, `title`, `description`, `state`, `priority`, `labels`, `project`, `assignee`, `dueDate`, `url`, and `parent`. State and priority accept Linear's names, numbers (`0` none through `4` low), or `{ "name", "type" }` / `{ "value", "name" }`. The Linear identifier is stored on `external_refs.linear_id` and the task still gets its own `HQ-` id. Running the same array again updates those tasks instead of duplicating them. The owner is the issue's `agent` or `owner` slug when it matches an agent, otherwise the assignee when that person is an agent, otherwise the existing owner, otherwise Roger.

```bash
curl -s -X POST http://localhost:3000/api/agent/import/linear \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "identifier": "ENG-12",
      "title": "Ship the board",
      "description": "Replace the queue",
      "state": { "name": "In Progress", "type": "started" },
      "priority": 2,
      "labels": ["Launch"],
      "project": "Agent HQ",
      "assignee": "R5-D4",
      "dueDate": "2026-11-20",
      "url": "https://linear.app/herzen/issue/ENG-12",
      "parent": "ENG-1"
    }
  ]'
```

### Log a document event

Upserts a document by `vault_path`, then appends an event. `action` is `created`, `edited`, `moved`, or `archived`. `url` is optional and must be `http`, `https`, or `obsidian`. The admin key must include `agent`. That named agent is stored on the event and shown on the Documents tab.

A move passes `from_path` as the previous vault path. It returns 201 whether or not a document was already logged there:

- A document at `from_path` is renamed to `vault_path`.
- If nothing is logged at `from_path`, the route creates a document at `vault_path`, or updates the document already stored there.
- The event stores `from_path`. `created`, `edited`, and `archived` store null.
- If `from_path` and `vault_path` already belong to two different documents, the response is 409 `{ "error": "A document already uses that vault path" }`.

```bash
curl -s -X POST http://localhost:3000/api/agent/documents \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly priorities memo",
    "vault_path": "Agents/Roger/weekly-priorities.md",
    "from_path": "Agents/Roger/priorities-draft.md",
    "action": "moved",
    "change_summary": "Filed the draft under the standing name"
  }'
```

```bash
curl -s -X POST http://localhost:3000/api/agent/documents \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly priorities memo",
    "vault_path": "Agents/Roger/weekly-priorities.md",
    "url": "obsidian://open?vault=HQ&file=Agents%2FRoger%2Fweekly-priorities",
    "action": "edited",
    "change_summary": "Added the noon decisions"
  }'
```

### Log outreach

`POST /api/agent/outreach` creates a row and returns 201 with its `id`. `PATCH /api/agent/outreach/{id}` updates one. `GET /api/agent/outreach` lists rows.

Header: `Authorization: Bearer <key>` and, for writes, `Content-Type: application/json`.

`channel` is `email`, `linkedin`, or `other`. `status` is `drafted`, `sent`, `replied`, or `meeting`.

Create body:

| Field | Required | Notes |
| --- | --- | --- |
| `person_name` | yes | 200 characters or fewer |
| `channel` | yes | `email`, `linkedin`, or `other` |
| `status` | yes | `drafted`, `sent`, `replied`, or `meeting` |
| `email` | one of email or linkedin_url | An email address, 320 characters or fewer |
| `linkedin_url` | one of email or linkedin_url | `http` or `https`, 500 characters or fewer |
| `company` | no | 200 characters or fewer |
| `title` | no | Role at the company, 200 characters or fewer |
| `message` | no | Full text or a summary, 8000 characters or fewer |
| `source_url` | no | `http` or `https`, 1000 characters or fewer |
| `contacted_at` | no | ISO timestamp. Omitted means the server time of the request |
| `agent` | admin key only | Agent slug. An agent key may omit it and can only write as itself |

A patch sends only the fields that change. Clearing `email` is allowed when `linkedin_url` remains, and the reverse. Clearing both returns 400. `contacted_at` cannot be cleared. Only the owning agent or the admin key can patch a row. Another agent's key gets 404 `Outreach not found`. The admin key can pass `agent` to move the row to a different agent.

List query: `status` filters to one status. `agent` filters to one slug. An agent key always sees only its own rows. Asking for another slug returns 403.

Each write sets `agents.last_active` and adds an activity row for that agent. The list does not.

Responses:

| Status | Body |
| --- | --- |
| 201 | The created row, including `id` and `agent` |
| 200 | `PATCH` returns the updated row. `GET` returns `{ "items": [ ... ] }` |
| 400 | `{ "error" }` when the JSON, an enum, or a contact field is invalid |
| 401 | `{ "error": "Unauthorized" }` when the bearer key is missing or unknown |
| 403 | `{ "error" }` when an agent key tries to act for or list someone else |
| 404 | `{ "error": "Unknown agent" }` or `{ "error": "Outreach not found" }` |

```bash
curl -s -X POST http://localhost:3000/api/agent/outreach \
  -H "Authorization: Bearer $HONDO_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "person_name": "Ada Lovelace",
    "company": "Analytical Engines",
    "title": "Founder",
    "email": "ada@example.com",
    "linkedin_url": "https://www.linkedin.com/in/ada",
    "channel": "email",
    "status": "sent",
    "message": "Asked for a short call next week.",
    "source_url": "https://example.com/ada"
  }'
```

Admin, acting as Hondo:

```bash
curl -s -X POST http://localhost:3000/api/agent/outreach \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent":"hondo","person_name":"Grace Hopper","linkedin_url":"https://www.linkedin.com/in/grace","channel":"linkedin","status":"drafted"}'
```

Update a status:

```bash
curl -s -X PATCH http://localhost:3000/api/agent/outreach/OUTREACH_ID \
  -H "Authorization: Bearer $HONDO_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"replied"}'
```

List sent outreach:

```bash
curl -s "http://localhost:3000/api/agent/outreach?status=sent" \
  -H "Authorization: Bearer $HONDO_KEY"
```

The signed-in Outreach tab shows name, company, title, contact, channel, date, a status pill, a source link, and a message preview. Filters are status and agent. The table polls `GET /api/live/outreach` about every 10 seconds, pauses while the tab is hidden, and polls again when the tab is visible. That route uses the session cookie.

### Post a status heartbeat

`POST /api/agent/status`

Header: `Authorization: Bearer <key>` and `Content-Type: application/json`.

Body fields:

| Field | Required | Notes |
| --- | --- | --- |
| `state` | yes | `working`, `idle`, or `blocked` |
| `working_on` | when `state` is `working` or `blocked` | What the agent is doing now. A single line, 200 characters or fewer. Optional for `idle`; blank is stored as an empty string. |
| `blocked_reason` | no | Why the agent is blocked. 1000 characters or fewer. Stored only while `state` is `blocked`. |
| `unblock_needed` | no | What unblocks the agent. 1000 characters or fewer. Stored only while `state` is `blocked`. |
| `waiting_on` | no | Who or what the agent is waiting on. 1000 characters or fewer. If this is set and `unblock_needed` is omitted, `unblock_needed` is stored as the same text. Cleared when `state` is not `blocked`. |
| `source_url` | no | `http` or `https`, 1000 characters or fewer. Cleared when `state` is not `blocked`. |
| `agent` | admin key only | Agent slug, same rule as the other write routes. An agent key may omit it and can only post for itself. |

The server records a heartbeat and sets the timestamp. A client-supplied time is ignored. It also sets `agents.last_active`. The same presence update happens after a successful report, task create or update, comment, link, document event, or outreach create or update, so a chat turn does not need its own status post.

The card keeps an explicit `working` or `blocked` state and the `working_on` text. From `last_active` it shows “Active 4 min ago” until that time is 2 hours old, then “Last active 5 h ago”.

The signed-in board polls server routes about every 10 seconds. Those routes use the session cookie. The browser does not talk to Supabase.

The board shows a Live indicator with “Updated 3s ago” for the last successful poll and the latest activity time across every agent (the newest `last_active` or feed timestamp, in Eastern Time). Agent cards (portrait, pill, and speech bubble), the daily snapshot (counts, done today, mood), the activity feed, and the same portraits on the agent, reports, and documents pages refresh on that cadence without a full reload. “Active 4 min ago” advances in the browser between polls. Polling pauses while the tab is hidden and runs again as soon as the tab is visible.

Responses:

| Status | Body |
| --- | --- |
| 200 | `{ "agent", "state", "working_on", "updated_at", "blocked_reason", "unblock_needed", "waiting_on", "source_url" }` |
| 400 | `{ "error" }` when the JSON or a field is invalid |
| 401 | `{ "error": "Unauthorized" }` when the bearer key is missing or unknown |
| 403 | `{ "error" }` when an agent key tries to act for someone else |
| 404 | `{ "error": "Unknown agent" }` when the admin key names a slug that does not exist |

```bash
curl -s -X POST http://localhost:3000/api/agent/status \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"state":"working","working_on":"Weekly priorities memo for Tito"}'
```

Admin, acting as Chopper:

```bash
curl -s -X POST http://localhost:3000/api/agent/status \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "chopper",
    "state": "blocked",
    "working_on": "Waiting on the Coral Gables citations",
    "blocked_reason": "Citations have not arrived",
    "waiting_on": "Herzen",
    "source_url": "https://linear.app/herzen/issue/HQ-12"
  }'
```

A report, task change, document event, outreach create or update, or status post writes an `activity` row, so the live feed shows that call. The actor is the agent slug. With the admin key, pass `agent`: the document event, the outreach row, and the activity row are stored as that agent. A task update that changes nothing still refreshes `last_active` and does not add an activity row. Edits from the dashboard stay attributed to `tito` and do not move `last_active`.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Deploy on Vercel

Import the repo, set the five environment variables above, and deploy. No new environment variables are required for work tracking. Apply the SQL migrations, including `20261112210000_work_tracking.sql`, to the Supabase project those variables point at before deploying this version. The production session cookie is Secure, so the site needs HTTPS, which Vercel provides.
