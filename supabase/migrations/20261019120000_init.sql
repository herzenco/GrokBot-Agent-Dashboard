-- Agent HQ schema. Apply this in the Supabase SQL editor or with the Supabase CLI.
-- The app talks to Postgres only through the service role. RLS is on and there are no policies,
-- so the anon and authenticated keys cannot read or write these tables.
-- Sample tasks, reports, and activity are dated 19 October 2026 in America/New_York,
-- the morning the board design was approved.

create extension if not exists pgcrypto;

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  api_key_hash text,
  sort_order integer not null unique
);

create unique index agents_api_key_hash_key
  on public.agents (api_key_hash)
  where api_key_hash is not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  agent_id uuid not null references public.agents (id),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  blocked boolean not null default false,
  blocked_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);

create index tasks_agent_id_idx on public.tasks (agent_id);
create index tasks_status_idx on public.tasks (status);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  vault_path text not null unique,
  url text,
  created_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now()
);

comment on table public.documents is 'Audit trail only. File contents are never stored.';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id),
  report_date date not null,
  done jsonb not null default '[]'::jsonb,
  in_progress jsonb not null default '[]'::jsonb,
  blocked jsonb not null default '[]'::jsonb,
  posted_at timestamptz not null default now(),
  constraint reports_agent_date_key unique (agent_id, report_date),
  constraint reports_done_is_array check (jsonb_typeof(done) = 'array'),
  constraint reports_in_progress_is_array check (jsonb_typeof(in_progress) = 'array'),
  constraint reports_blocked_is_array check (jsonb_typeof(blocked) = 'array')
);

create index reports_report_date_idx on public.reports (report_date);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  verb text not null,
  task_id uuid references public.tasks (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index activity_created_at_idx on public.activity (created_at desc);

create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  agent_id uuid not null references public.agents (id),
  action text not null check (action in ('created', 'edited', 'moved', 'archived')),
  change_summary text not null,
  created_at timestamptz not null default now()
);

create index document_events_document_idx on public.document_events (document_id, created_at);

create or replace function public.set_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_task_updated_at();

alter table public.agents enable row level security;
alter table public.tasks enable row level security;
alter table public.reports enable row level security;
alter table public.activity enable row level security;
alter table public.documents enable row level security;
alter table public.document_events enable row level security;

insert into public.agents (slug, name, role, sort_order) values
  ('roger', 'Roger', 'Chief of staff · Admin', 1),
  ('chopper', 'Chopper', 'Herzen Co. · Matt & Marshall', 2),
  ('ap-5', 'AP-5', 'Skydeo', 3),
  ('ig-11', 'IG-11', 'Grupo Xcaret · Delphinus · Family office', 4),
  ('k-2so', 'K-2SO', 'Travel', 5),
  ('yoda', 'Yoda', 'Humanismo Evolutivo', 6),
  ('cartier', 'Cartier', 'Photography · Books', 7),
  ('r5-d4', 'R5-D4', 'Developer', 8);

insert into public.tasks (
  agent_id, title, details, priority, status, blocked, blocked_note, created_at, updated_at, done_at
)
select
  a.id,
  v.title,
  v.details,
  v.priority,
  v.status,
  v.blocked,
  v.blocked_note,
  v.created_at,
  v.updated_at,
  v.done_at
from (
  values
    ('roger'::text, 'Weekly priorities memo for Tito'::text, 'Three decisions Tito needs before noon.'::text, 'normal'::text, 'doing'::text, false, null::text, timestamptz '2026-10-19 07:30:00-04', timestamptz '2026-10-19 07:30:00-04', null::timestamptz),
    ('roger', 'Morning brief sent', null, 'normal', 'done', false, null, timestamptz '2026-10-19 07:10:00-04', timestamptz '2026-10-19 08:01:00-04', timestamptz '2026-10-19 08:01:00-04'),
    ('roger', 'Inbox triaged to 6', null, 'normal', 'done', false, null, timestamptz '2026-10-19 07:20:00-04', timestamptz '2026-10-19 08:12:00-04', timestamptz '2026-10-19 08:12:00-04'),
    ('roger', 'Workspace seats renewed', null, 'normal', 'done', false, null, timestamptz '2026-10-18 16:00:00-04', timestamptz '2026-10-19 08:24:00-04', timestamptz '2026-10-19 08:24:00-04'),
    ('roger', 'September receipts filed', null, 'low', 'done', false, null, timestamptz '2026-10-17 11:00:00-04', timestamptz '2026-10-19 08:36:00-04', timestamptz '2026-10-19 08:36:00-04'),
    ('roger', 'Book Thursday 1:1 with Tito', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 09:00:00-04', timestamptz '2026-10-17 09:00:00-04', null),
    ('roger', 'Chase unsigned vendor MSA', null, 'high', 'todo', false, null, timestamptz '2026-10-18 10:00:00-04', timestamptz '2026-10-18 10:00:00-04', null),
    ('roger', 'Prep Friday all-hands notes', null, 'low', 'todo', false, null, timestamptz '2026-10-18 15:00:00-04', timestamptz '2026-10-18 15:00:00-04', null),

    ('chopper', 'Audit report: Coral Gables dental', 'Pull the remaining local citations before the draft goes to Matt.', 'high', 'doing', false, null, timestamptz '2026-10-19 07:40:00-04', timestamptz '2026-10-19 09:22:00-04', null),
    ('chopper', 'M&M Q4 content calendar', null, 'normal', 'doing', false, null, timestamptz '2026-10-19 08:10:00-04', timestamptz '2026-10-19 08:10:00-04', null),
    ('chopper', '5 audit outreach emails', null, 'normal', 'done', false, null, timestamptz '2026-10-18 09:00:00-04', timestamptz '2026-10-19 08:15:00-04', timestamptz '2026-10-19 08:15:00-04'),
    ('chopper', 'LinkedIn post: local SEO myths', null, 'normal', 'done', false, null, timestamptz '2026-10-18 14:00:00-04', timestamptz '2026-10-19 08:28:00-04', timestamptz '2026-10-19 08:28:00-04'),
    ('chopper', 'Pull Coral Gables keyword gaps', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 11:30:00-04', timestamptz '2026-10-17 11:30:00-04', null),
    ('chopper', 'Reply to Marshall on ad copy', null, 'high', 'todo', false, null, timestamptz '2026-10-18 09:40:00-04', timestamptz '2026-10-18 09:40:00-04', null),
    ('chopper', 'Schedule Matt''s LinkedIn batch', null, 'normal', 'todo', false, null, timestamptz '2026-10-18 13:00:00-04', timestamptz '2026-10-18 13:00:00-04', null),
    ('chopper', 'Export GA4 for Herzen Co.', null, 'low', 'todo', false, null, timestamptz '2026-10-17 16:20:00-04', timestamptz '2026-10-17 16:20:00-04', null),

    ('ap-5', 'SAM MCP auth scopes', 'Tito raised this to high before the scopes review.', 'high', 'doing', false, null, timestamptz '2026-10-19 08:00:00-04', timestamptz '2026-10-19 09:02:00-04', null),
    ('ap-5', 'SAM usage export', 'Pull the last 30 days once credentials land.', 'high', 'doing', true, 'Needs prod read credentials from Skydeo admin', timestamptz '2026-10-18 15:00:00-04', timestamptz '2026-10-19 09:18:00-04', null),
    ('ap-5', 'Meta billing PR', null, 'normal', 'done', false, null, timestamptz '2026-10-18 11:00:00-04', timestamptz '2026-10-19 09:00:00-04', timestamptz '2026-10-19 09:00:00-04'),
    ('ap-5', 'Curate weekly digest', null, 'normal', 'done', false, null, timestamptz '2026-10-18 08:00:00-04', timestamptz '2026-10-19 09:20:00-04', timestamptz '2026-10-19 09:20:00-04'),
    ('ap-5', 'Brand Manager QA notes', null, 'normal', 'done', false, null, timestamptz '2026-10-17 15:00:00-04', timestamptz '2026-10-19 09:40:00-04', timestamptz '2026-10-19 09:40:00-04'),
    ('ap-5', 'Confirm Meta pixel on /pricing', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 10:00:00-04', timestamptz '2026-10-17 10:00:00-04', null),
    ('ap-5', 'Draft Skydeo changelog', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 12:00:00-04', timestamptz '2026-10-17 12:00:00-04', null),
    ('ap-5', 'Check digest unsubscribe spike', null, 'high', 'todo', false, null, timestamptz '2026-10-18 09:15:00-04', timestamptz '2026-10-18 09:15:00-04', null),
    ('ap-5', 'File brand color exceptions', null, 'low', 'todo', false, null, timestamptz '2026-10-18 14:30:00-04', timestamptz '2026-10-18 14:30:00-04', null),
    ('ap-5', 'Ping finance on invoice 441', null, 'normal', 'todo', false, null, timestamptz '2026-10-18 16:45:00-04', timestamptz '2026-10-18 16:45:00-04', null),

    ('ig-11', 'Delphinus Q3 board pack summary', null, 'normal', 'doing', false, null, timestamptz '2026-10-19 08:20:00-04', timestamptz '2026-10-19 08:20:00-04', null),
    ('ig-11', 'Oficina Familiar trust calendar', null, 'normal', 'done', false, null, timestamptz '2026-10-18 10:30:00-04', timestamptz '2026-10-19 09:40:00-04', timestamptz '2026-10-19 09:40:00-04'),
    ('ig-11', 'Xcaret board memo draft', 'Draft for IG-11 to file in the vault.', 'high', 'todo', false, null, timestamptz '2026-10-19 09:51:00-04', timestamptz '2026-10-19 09:51:00-04', null),
    ('ig-11', 'Send family office wire checklist', null, 'normal', 'todo', false, null, timestamptz '2026-10-18 11:15:00-04', timestamptz '2026-10-18 11:15:00-04', null),

    ('k-2so', 'Hold options for Cancun Nov 12', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 13:00:00-04', timestamptz '2026-10-17 13:00:00-04', null),
    ('k-2so', 'Check passport expiry for Tito', null, 'high', 'todo', false, null, timestamptz '2026-10-18 08:40:00-04', timestamptz '2026-10-18 08:40:00-04', null),

    ('yoda', 'Translate October essay to English', null, 'normal', 'doing', false, null, timestamptz '2026-10-19 08:05:00-04', timestamptz '2026-10-19 08:05:00-04', null),
    ('yoda', 'October newsletter', null, 'normal', 'done', false, null, timestamptz '2026-10-18 09:00:00-04', timestamptz '2026-10-19 09:00:00-04', timestamptz '2026-10-19 09:00:00-04'),
    ('yoda', 'Event RSVP list cleaned', null, 'normal', 'done', false, null, timestamptz '2026-10-18 15:20:00-04', timestamptz '2026-10-19 09:20:00-04', timestamptz '2026-10-19 09:20:00-04'),
    ('yoda', 'Outline November essay', null, 'normal', 'todo', false, null, timestamptz '2026-10-17 10:40:00-04', timestamptz '2026-10-17 10:40:00-04', null),
    ('yoda', 'Proof Spanish captions', null, 'low', 'todo', false, null, timestamptz '2026-10-18 12:10:00-04', timestamptz '2026-10-18 12:10:00-04', null),
    ('yoda', 'Collect RSVP no-shows', null, 'normal', 'todo', false, null, timestamptz '2026-10-18 17:00:00-04', timestamptz '2026-10-18 17:00:00-04', null),

    ('cartier', 'Saturday shoot culled to 48', null, 'normal', 'done', false, null, timestamptz '2026-10-18 19:00:00-04', timestamptz '2026-10-19 08:50:00-04', timestamptz '2026-10-19 08:50:00-04'),
    ('cartier', 'Order book dummy for the winter series', null, 'low', 'todo', false, null, timestamptz '2026-10-17 14:00:00-04', timestamptz '2026-10-17 14:00:00-04', null),

    ('r5-d4', 'OCC daily-report endpoint', null, 'normal', 'doing', false, null, timestamptz '2026-10-19 08:20:00-04', timestamptz '2026-10-19 08:20:00-04', null),
    ('r5-d4', 'Deploy OCC', 'Cut over after the DNS record propagates.', 'high', 'doing', true, 'DNS record for operations.herzenco.co still pending', timestamptz '2026-10-18 16:00:00-04', timestamptz '2026-10-19 10:04:00-04', null),
    ('r5-d4', 'Login rate limit fixed', null, 'normal', 'done', false, null, timestamptz '2026-10-17 09:30:00-04', timestamptz '2026-10-19 08:10:00-04', timestamptz '2026-10-19 08:10:00-04'),
    ('r5-d4', 'TimeShare CSV export', null, 'normal', 'done', false, null, timestamptz '2026-10-17 15:40:00-04', timestamptz '2026-10-19 08:30:00-04', timestamptz '2026-10-19 08:30:00-04'),
    ('r5-d4', 'Node 22 upgrade', null, 'normal', 'done', false, null, timestamptz '2026-10-16 11:00:00-04', timestamptz '2026-10-19 08:50:00-04', timestamptz '2026-10-19 08:50:00-04'),
    ('r5-d4', 'Add healthcheck to OCC worker', null, 'normal', 'todo', false, null, timestamptz '2026-10-18 10:05:00-04', timestamptz '2026-10-18 10:05:00-04', null)
) as v(slug, title, details, priority, status, blocked, blocked_note, created_at, updated_at, done_at)
join public.agents a on a.slug = v.slug;

insert into public.reports (agent_id, report_date, done, in_progress, blocked, posted_at)
select a.id, date '2026-10-19', v.done, v.in_progress, v.blocked, v.posted_at
from (
  values
    ('roger'::text,
      '["Morning brief sent","Inbox triaged to 6","Workspace seats renewed","September receipts filed"]'::jsonb,
      '["Weekly priorities memo for Tito"]'::jsonb,
      '[]'::jsonb,
      timestamptz '2026-10-19 08:05:00-04'),
    ('chopper',
      '["5 audit outreach emails","LinkedIn post: local SEO myths"]'::jsonb,
      '["Audit report: Coral Gables dental","M&M Q4 content calendar"]'::jsonb,
      '[]'::jsonb,
      timestamptz '2026-10-19 08:40:00-04'),
    ('ap-5',
      '["Meta billing PR","Curate weekly digest","Brand Manager QA notes"]'::jsonb,
      '["SAM MCP auth scopes"]'::jsonb,
      '["SAM usage export: Needs prod read credentials from Skydeo admin"]'::jsonb,
      timestamptz '2026-10-19 09:15:00-04'),
    ('ig-11',
      '["Oficina Familiar trust calendar"]'::jsonb,
      '["Delphinus Q3 board pack summary"]'::jsonb,
      '[]'::jsonb,
      timestamptz '2026-10-19 09:48:00-04'),
    ('yoda',
      '["October newsletter","Event RSVP list cleaned"]'::jsonb,
      '["Translate October essay to English"]'::jsonb,
      '[]'::jsonb,
      timestamptz '2026-10-19 09:30:00-04')
) as v(slug, done, in_progress, blocked, posted_at)
join public.agents a on a.slug = v.slug;

insert into public.activity (actor, verb, task_id, summary, created_at)
select v.actor, v.verb, t.id, v.summary, v.created_at
from (
  values
    ('ap-5'::text, 'moved'::text, 'ap-5'::text, 'Meta billing PR'::text, 'moved “Meta billing PR” to Done'::text, timestamptz '2026-10-19 10:12:00-04'),
    ('r5-d4', 'blocked', 'r5-d4', 'Deploy OCC', 'marked “Deploy OCC” blocked', timestamptz '2026-10-19 10:04:00-04'),
    ('tito', 'created', 'ig-11', 'Xcaret board memo draft', 'added “Xcaret board memo draft” for IG-11', timestamptz '2026-10-19 09:51:00-04'),
    ('chopper', 'moved', 'chopper', 'Audit report: Coral Gables dental', 'moved “Audit report: Coral Gables dental” to Doing', timestamptz '2026-10-19 09:22:00-04'),
    ('ap-5', 'blocked', 'ap-5', 'SAM usage export', 'marked “SAM usage export” blocked', timestamptz '2026-10-19 09:18:00-04'),
    ('tito', 'priority', 'ap-5', 'SAM MCP auth scopes', 'raised “SAM MCP auth scopes” to High', timestamptz '2026-10-19 09:02:00-04'),
    ('roger', 'moved', 'roger', 'Morning brief sent', 'moved “Morning brief sent” to Done', timestamptz '2026-10-19 08:01:00-04')
) as v(actor, verb, slug, title, summary, created_at)
join public.agents a on a.slug = v.slug
join public.tasks t on t.agent_id = a.id and t.title = v.title;

insert into public.activity (actor, verb, summary, created_at) values
  ('ig-11', 'posted_report', 'posted today’s report', timestamptz '2026-10-19 09:48:00-04'),
  ('yoda', 'posted_report', 'posted today’s report', timestamptz '2026-10-19 09:30:00-04');

insert into public.documents (title, vault_path, url, created_at, last_changed_at) values
  ('Weekly priorities memo', 'Agents/Roger/weekly-priorities.md', 'obsidian://open?vault=HQ&file=Agents%2FRoger%2Fweekly-priorities', timestamptz '2026-10-18 09:00:00-04', timestamptz '2026-10-18 18:10:00-04'),
  ('Coral Gables dental audit', 'Agents/Chopper/coral-gables-dental.md', 'obsidian://open?vault=HQ&file=Agents%2FChopper%2Fcoral-gables-dental', timestamptz '2026-10-17 15:00:00-04', timestamptz '2026-10-18 16:40:00-04'),
  ('SAM usage export', 'Agents/AP-5/sam-usage-export.md', null, timestamptz '2026-10-18 11:05:00-04', timestamptz '2026-10-18 11:05:00-04'),
  ('October essay', 'Agents/Yoda/october-essay.md', 'obsidian://open?vault=HQ&file=Agents%2FYoda%2Foctober-essay', timestamptz '2026-10-16 12:00:00-04', timestamptz '2026-10-18 14:20:00-04'),
  ('OCC deploy notes', 'Agents/R5-D4/occ-deploy.md', null, timestamptz '2026-10-15 10:00:00-04', timestamptz '2026-10-18 17:05:00-04');

insert into public.document_events (document_id, agent_id, action, change_summary, created_at)
select d.id, a.id, v.action, v.change_summary, v.created_at
from (
  values
    ('Agents/Roger/weekly-priorities.md'::text, 'roger'::text, 'created'::text, 'Opened the weekly priorities note'::text, timestamptz '2026-10-18 09:00:00-04'),
    ('Agents/Roger/weekly-priorities.md', 'roger', 'edited', 'Added the Monday decisions', timestamptz '2026-10-18 18:10:00-04'),
    ('Agents/Chopper/coral-gables-dental.md', 'chopper', 'created', 'Started the Coral Gables audit note', timestamptz '2026-10-17 15:00:00-04'),
    ('Agents/Chopper/coral-gables-dental.md', 'chopper', 'edited', 'Added outreach results', timestamptz '2026-10-18 16:40:00-04'),
    ('Agents/AP-5/sam-usage-export.md', 'ap-5', 'created', 'Logged the export the admin still owes', timestamptz '2026-10-18 11:05:00-04'),
    ('Agents/Yoda/october-essay.md', 'yoda', 'created', 'Created the October essay note', timestamptz '2026-10-16 12:00:00-04'),
    ('Agents/Yoda/october-essay.md', 'yoda', 'edited', 'Spanish draft locked', timestamptz '2026-10-18 14:20:00-04'),
    ('Agents/R5-D4/occ-deploy.md', 'r5-d4', 'created', 'Opened the OCC deploy note', timestamptz '2026-10-15 10:00:00-04'),
    ('Agents/R5-D4/occ-deploy.md', 'r5-d4', 'edited', 'DNS for operations.herzenco.co still pending', timestamptz '2026-10-18 17:05:00-04')
) as v(vault_path, slug, action, change_summary, created_at)
join public.documents d on d.vault_path = v.vault_path
join public.agents a on a.slug = v.slug;

insert into public.activity (actor, verb, document_id, summary, created_at)
select a.slug, 'document_' || e.action, e.document_id,
  e.action || ' “' || d.title || '”',
  e.created_at
from public.document_events e
join public.agents a on a.id = e.agent_id
join public.documents d on d.id = e.document_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all privileges on all tables in schema public to service_role;
    grant all privileges on all sequences in schema public to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;
