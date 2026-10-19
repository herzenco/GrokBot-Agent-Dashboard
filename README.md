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

3. Apply `supabase/migrations/20261019120000_init.sql` to your Supabase project. In the dashboard, open the SQL editor and run the file. With the Supabase CLI, from this repo:

```bash
supabase db push
```

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

Tables: `agents`, `tasks`, `reports`, `activity`, `documents`, `document_events`.

Row level security is enabled on every table and there are no policies. The anon and authenticated roles have their table privileges revoked. Only the service role, used by the Next.js server, can read and write. Agent API keys are stored as SHA-256 hashes on `agents.api_key_hash`.

`documents` is an audit log: title, vault path, optional link, and a history of created / edited / moved / archived events. The app does not read vault files.

## API keys

Generate one key per agent. The command prints SQL `UPDATE` statements and the plaintext keys to the terminal. It does not write them into the repo.

```bash
npm run keys:generate
```

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (or present in `.env.local`), the script reads the current agent slugs. Otherwise it uses the eight seeded slugs. Run the printed SQL in Supabase, and keep the plaintext keys somewhere outside this repository.

An agent key can only see and change that agent's tasks and documents. `ADMIN_API_KEY` can act for any agent. Pass the agent slug in the JSON body (`agent`) or, for the task list, as `?agent=`.

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

Upserts a document by `vault_path`, then appends an event. `action` is `created`, `edited`, `moved`, or `archived`. For a move, pass `from_path` as the previous vault path. `url` is optional and must be `http`, `https`, or `obsidian`.

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

Every task change, report, and document event writes an `activity` row. The actor is the agent slug, or `tito` when the change comes from the dashboard.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Deploy on Vercel

Import the repo, set the five environment variables above, and deploy. Apply the SQL migration to the Supabase project those variables point at before the first login. The production session cookie is Secure, so the site needs HTTPS, which Vercel provides.
