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

`20261019120000_init.sql` creates the board. `20261019180000_agent_heartbeats.sql` adds the live heartbeat tables. `20261020120000_agent_last_active.sql` adds `agents.last_active`. `20261020140000_document_event_from_path.sql` adds `document_events.from_path`. `20261021140000_outreach.sql` adds the `outreach` table. The later files insert no sample rows and no agent or API key. Apply them before using live status, document moves, or the Outreach tab. This repo does not apply them for you.

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

The session cookie is httpOnly, SameSite=Lax, and valid for 30 days. In production it is also marked Secure. Login attempts are limited to 8 failures per IP per 15 minutes, in memory on each server instance.

## Database

Tables: `agents`, `tasks`, `reports`, `activity`, `documents`, `document_events`, `agent_status`, `agent_heartbeats`, `outreach`.

`agent_status` keeps the latest explicit status for each agent. `agent_heartbeats` stores every status post. Those timestamps are set by the database, not by the client.

`agents.last_active` is the server time of the last successful agent write: a report, a task create or update, a document event, an outreach create or update, or a status post (including a heartbeat). Reads do not move it. The board treats that column as the agent’s effective presence:

- A write in the last 10 minutes (`RECENT_ACTIVITY_MS`) shows the agent as working, even when the last posted state is idle. A posted `working` state shows its `working_on` text. Otherwise the card shows the latest activity line, or “Active”.
- An idle status post by itself does not count as that fresh work. A later write does.
- A posted `working` state older than 30 minutes (`POSTED_WORKING_MS`), with no newer write, shows as idle or napping.
- A posted `blocked` state stays blocked until the agent posts a different state. The card shows how long it has been blocked.
- Within 2 hours the time line says “Active 4 min ago”. After 2 hours it says “Last active 5 h ago”. That mark is `STALE_AFTER_MS`.

All three durations live in `src/lib/live.ts`. The working, stuck, and napping counts use this effective state, and the board still refreshes about every 10 seconds.

Hondo and Frick use the same card portraits as the other agents when their names are Hondo and Frick. Hondo is the pirate. Frick is the inspector with a magnifying glass. Their agent rows are not seeded here.

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

### List tasks

An agent key returns that agent's tasks. An admin key returns every task, or one agent when `?agent=` is set.

```bash
curl -s http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ROGER_KEY"

curl -s "http://localhost:3000/api/agent/tasks?agent=ap-5" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### Create a task

New tasks start in To do. Priority is `low`, `normal`, or `high` (default `normal`).

```bash
curl -s -X POST http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ROGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Call the printer","details":"Menus for Friday","priority":"high"}'
```

Admin:

```bash
curl -s -X POST http://localhost:3000/api/agent/tasks \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent":"yoda","title":"Outline November essay","priority":"normal"}'
```

### Update a task

Send only the fields that change. Status is `todo`, `doing`, or `done`. Moving a task to done clears a block. Marking it blocked requires `blocked_note`. Only the admin key can set `agent` to a different slug.

```bash
curl -s -X PATCH http://localhost:3000/api/agent/tasks/TASK_ID \
  -H "Authorization: Bearer $AP5_KEY" \
  -H "Content-Type: application/json" \
  -d '{"blocked": true, "blocked_note": "Waiting on Skydeo admin"}'
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
| `agent` | admin key only | Agent slug, same rule as the other write routes. An agent key may omit it and can only post for itself. |

The server records a heartbeat and sets the timestamp. A client-supplied time is ignored. It also sets `agents.last_active`. The same presence update happens after a successful report, task create, task update, document event, or outreach create or update, so a chat turn does not need its own status post.

The card keeps an explicit `working` or `blocked` state and the `working_on` text. From `last_active` it shows “Active 4 min ago” until that time is 2 hours old, then “Last active 5 h ago”.

The signed-in board polls server routes about every 10 seconds. Those routes use the session cookie. The browser does not talk to Supabase.

The board shows a Live indicator with “Updated 3s ago” for the last successful poll and the latest activity time across every agent (the newest `last_active` or feed timestamp, in Eastern Time). Agent cards, the daily snapshot (counts, done today, mood), and the activity feed refresh on that same cadence without a full reload. “Active 4 min ago” advances in the browser between polls. Polling pauses while the tab is hidden and runs again as soon as the tab is visible.

Responses:

| Status | Body |
| --- | --- |
| 200 | `{ "agent", "state", "working_on", "updated_at" }` |
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
  -d '{"agent":"chopper","state":"blocked","working_on":"Waiting on the Coral Gables citations"}'
```

A report, task change, document event, outreach create or update, or status post writes an `activity` row, so the live feed shows that call. The actor is the agent slug. With the admin key, pass `agent`: the document event, the outreach row, and the activity row are stored as that agent. A task update that changes nothing still refreshes `last_active` and does not add an activity row. Edits from the dashboard stay attributed to `tito` and do not move `last_active`.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Deploy on Vercel

Import the repo, set the five environment variables above, and deploy. Apply the SQL migrations to the Supabase project those variables point at before the first login. The production session cookie is Secure, so the site needs HTTPS, which Vercel provides.
