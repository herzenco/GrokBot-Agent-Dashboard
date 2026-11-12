-- Work tracking for Agent HQ: Linear-style workflow on top of the existing task board.
-- Additive only. No columns or rows are dropped. Apply after 20261112140000_blocked_waiting_and_source.sql.
-- The app still talks to Postgres only through the service role. RLS stays on and there are no policies.
--
-- Status and priority grow in place. Existing rows are backfilled to the canonical values
-- (doing -> in_progress, normal -> medium). The checks still allow the legacy values so an
-- agent that has not picked up the new API can keep posting "doing" and "normal".
-- Block columns (blocked_note, blocked_reason, unblock_needed, waiting_on, source_url) stay.
-- Durable links live in task_links and are not cleared when a block ends. task_block_events
-- keeps a copy of the block fields when a block is opened, updated, or cleared.

create sequence if not exists public.task_number_seq;

alter table public.tasks add column if not exists number integer;
alter table public.tasks add column if not exists identifier text;
alter table public.tasks add column if not exists project_id uuid;
alter table public.tasks add column if not exists assignee_agent_id uuid;
alter table public.tasks add column if not exists assignee_herzen boolean not null default false;
alter table public.tasks add column if not exists due_on date;
alter table public.tasks add column if not exists parent_id uuid;
alter table public.tasks add column if not exists external_refs jsonb not null default '{}'::jsonb;

-- Replace the original single-column checks. The loop drops whatever name Postgres assigned
-- (tasks_status_check / tasks_priority_check on a fresh init) and is safe to re-run.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select distinct con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conrelid = 'public.tasks'::regclass
      and con.contype = 'c'
      and att.attname in ('status', 'priority')
  loop
    execute format('alter table public.tasks drop constraint %I', constraint_name);
  end loop;
end $$;

update public.tasks set status = 'in_progress' where status = 'doing';
update public.tasks set priority = 'medium' where priority = 'normal';

alter table public.tasks alter column priority set default 'medium';

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'doing'));

alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check
  check (priority in ('none', 'low', 'medium', 'high', 'urgent', 'normal'));

alter table public.tasks drop constraint if exists tasks_external_refs_object;
alter table public.tasks add constraint tasks_external_refs_object
  check (jsonb_typeof(external_refs) = 'object');

comment on column public.tasks.external_refs is
  'Optional external ids. Known keys: linear_id, linear_url, cloud_agent_id (bc-...). Other string keys are allowed.';
comment on column public.tasks.source_url is
  'Block-only http(s) link. Cleared when the block ends. Durable links live in task_links.';
comment on column public.tasks.identifier is
  'Stable human id HQ-<number>. Assigned once and never reused.';

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_len check (char_length(name) between 1 and 80),
  constraint projects_slug_len check (char_length(slug) between 1 and 60)
);

create unique index if not exists projects_slug_key on public.projects (slug);

comment on table public.projects is
  'Shared projects. archived_at hides a project from the active board without deleting its tasks.';

alter table public.tasks drop constraint if exists tasks_project_id_fkey;
alter table public.tasks
  add constraint tasks_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete set null;

alter table public.tasks drop constraint if exists tasks_assignee_agent_id_fkey;
alter table public.tasks
  add constraint tasks_assignee_agent_id_fkey
  foreign key (assignee_agent_id) references public.agents (id) on delete set null;

alter table public.tasks drop constraint if exists tasks_parent_id_fkey;
alter table public.tasks
  add constraint tasks_parent_id_fkey
  foreign key (parent_id) references public.tasks (id) on delete set null;

alter table public.tasks drop constraint if exists tasks_parent_not_self;
alter table public.tasks add constraint tasks_parent_not_self
  check (parent_id is null or parent_id <> id);

alter table public.tasks drop constraint if exists tasks_one_assignee;
alter table public.tasks add constraint tasks_one_assignee
  check (assignee_herzen = false or assignee_agent_id is null);

-- Stable HQ-123 ids. Existing rows are numbered by created_at, then id.
with ranked as (
  select id, row_number() over (order by created_at, id) as n
  from public.tasks
  where number is null
)
update public.tasks as task
set number = ranked.n
from ranked
where task.id = ranked.id;

update public.tasks
set identifier = 'HQ-' || number::text
where identifier is null and number is not null;

select setval(
  'public.task_number_seq',
  coalesce((select max(number) from public.tasks), 1),
  (select max(number) is not null from public.tasks)
);

alter table public.tasks alter column number set default nextval('public.task_number_seq');
alter table public.tasks alter column number set not null;
alter table public.tasks alter column identifier set not null;

create unique index if not exists tasks_number_key on public.tasks (number);
create unique index if not exists tasks_identifier_key on public.tasks (identifier);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_parent_id_idx on public.tasks (parent_id);
create index if not exists tasks_assignee_agent_id_idx on public.tasks (assignee_agent_id);
create index if not exists tasks_due_on_idx on public.tasks (due_on);
create index if not exists tasks_blocked_open_idx on public.tasks (blocked) where blocked = true;

create unique index if not exists tasks_linear_id_key
  on public.tasks ((external_refs->>'linear_id'))
  where coalesce(external_refs->>'linear_id', '') <> '';

create index if not exists tasks_cloud_agent_id_idx
  on public.tasks ((external_refs->>'cloud_agent_id'))
  where coalesce(external_refs->>'cloud_agent_id', '') <> '';

create or replace function public.tasks_assign_identifier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    new.number := nextval('public.task_number_seq');
  end if;
  if new.identifier is null or btrim(new.identifier) = '' then
    new.identifier := 'HQ-' || new.number::text;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_assign_identifier on public.tasks;
create trigger tasks_assign_identifier
before insert on public.tasks
for each row
execute function public.tasks_assign_identifier();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_task_updated_at();

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint labels_name_len check (char_length(name) between 1 and 40),
  constraint labels_slug_len check (char_length(slug) between 1 and 40)
);

create unique index if not exists labels_slug_key on public.labels (slug);

create table if not exists public.task_labels (
  task_id uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (task_id, label_id)
);

create index if not exists task_labels_label_id_idx on public.task_labels (label_id);

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('pr', 'issue', 'doc', 'deploy', 'other')),
  url text not null,
  label text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint task_links_url_len check (char_length(url) between 1 and 1000),
  constraint task_links_label_len check (label is null or char_length(label) <= 200)
);

create unique index if not exists task_links_task_url_key on public.task_links (task_id, url);
create index if not exists task_links_task_id_idx on public.task_links (task_id, created_at);

comment on table public.task_links is
  'Durable PR, issue, doc, and deploy links. They stay when a block clears or the task is done.';

create table if not exists public.task_block_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  action text not null check (action in ('blocked', 'updated', 'cleared')),
  blocked_note text,
  blocked_reason text,
  unblock_needed text,
  waiting_on text,
  source_url text,
  actor text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_block_events_task_idx
  on public.task_block_events (task_id, created_at);

comment on table public.task_block_events is
  'History of block fields. Written when a block is opened, edited, or cleared, including when status becomes done.';

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comments_body_len check (char_length(body) between 1 and 8000)
);

create index if not exists task_comments_task_idx
  on public.task_comments (task_id, created_at);

drop trigger if exists task_comments_set_updated_at on public.task_comments;
create trigger task_comments_set_updated_at
before update on public.task_comments
for each row
execute function public.set_task_updated_at();

-- Keep the current block, and any source_url already stored, as history and a durable link.
insert into public.task_block_events (
  task_id, action, blocked_note, blocked_reason, unblock_needed, waiting_on, source_url, actor, created_at
)
select
  id,
  'blocked',
  blocked_note,
  blocked_reason,
  unblock_needed,
  waiting_on,
  source_url,
  'migration',
  updated_at
from public.tasks
where blocked = true
  and not exists (
    select 1 from public.task_block_events event where event.task_id = public.tasks.id
  );

insert into public.task_links (task_id, kind, url, label, created_by, created_at)
select id, 'other', btrim(source_url), 'Block source', 'migration', updated_at
from public.tasks
where source_url is not null
  and btrim(source_url) <> ''
  and char_length(btrim(source_url)) <= 1000
  and not exists (
    select 1 from public.task_links link
    where link.task_id = public.tasks.id and link.url = public.tasks.source_url
  );

alter table public.projects enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_links enable row level security;
alter table public.task_block_events enable row level security;
alter table public.task_comments enable row level security;

revoke all on function public.tasks_assign_identifier() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.tasks_assign_identifier() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.tasks_assign_identifier() from authenticated;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on public.projects to service_role;
    grant all privileges on public.labels to service_role;
    grant all privileges on public.task_labels to service_role;
    grant all privileges on public.task_links to service_role;
    grant all privileges on public.task_block_events to service_role;
    grant all privileges on public.task_comments to service_role;
    grant usage, select on sequence public.task_number_seq to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.projects from anon;
    revoke all on public.labels from anon;
    revoke all on public.task_labels from anon;
    revoke all on public.task_links from anon;
    revoke all on public.task_block_events from anon;
    revoke all on public.task_comments from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.projects from authenticated;
    revoke all on public.labels from authenticated;
    revoke all on public.task_labels from authenticated;
    revoke all on public.task_links from authenticated;
    revoke all on public.task_block_events from authenticated;
    revoke all on public.task_comments from authenticated;
  end if;
end $$;
