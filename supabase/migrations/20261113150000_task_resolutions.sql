-- Resolutions Herzen posts on a blocked task so the owning agent can act without leaving Agent HQ.
-- Additive only. No columns, tables, or task rows are dropped. Apply after 20261112210000_work_tracking.sql.
-- Existing comments stay kind = 'comment' via the column default. Existing tasks start at resolution_state 'none'.
-- The app still talks to Postgres only through the service role. RLS stays on and anon/authenticated stay revoked.

alter table public.task_comments
  add column if not exists kind text not null default 'comment';

alter table public.task_comments drop constraint if exists task_comments_kind_check;
alter table public.task_comments add constraint task_comments_kind_check
  check (kind in ('comment', 'resolution'));

comment on column public.task_comments.kind is
  'comment is an ordinary note. resolution is Herzen telling the owning agent how to close the block.';

alter table public.tasks
  add column if not exists resolution_state text not null default 'none';

alter table public.tasks drop constraint if exists tasks_resolution_state_check;
alter table public.tasks add constraint tasks_resolution_state_check
  check (resolution_state in ('none', 'awaiting_agent', 'acknowledged'));

alter table public.tasks
  add column if not exists resolution_pending boolean not null default false;

alter table public.tasks drop constraint if exists tasks_resolution_pending_matches;
alter table public.tasks add constraint tasks_resolution_pending_matches
  check (resolution_pending = (resolution_state = 'awaiting_agent'));

alter table public.tasks
  add column if not exists latest_resolution_at timestamptz;

alter table public.tasks
  add column if not exists resolution_acknowledged_at timestamptz;

comment on column public.tasks.resolution_state is
  'none, awaiting_agent after Herzen posts a resolution, or acknowledged after the agent accepts it or the block clears.';
comment on column public.tasks.resolution_pending is
  'True only while resolution_state is awaiting_agent. Agents poll this.';
comment on column public.tasks.latest_resolution_at is
  'When Herzen last posted a resolution on this task.';
comment on column public.tasks.resolution_acknowledged_at is
  'When the current resolution was acknowledged. Cleared when a newer resolution is posted.';

create index if not exists tasks_resolution_pending_idx
  on public.tasks (latest_resolution_at desc nulls last)
  where resolution_pending;

-- Widen the block-history actions. The old check only allowed blocked, updated, and cleared.
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
    where con.conrelid = 'public.task_block_events'::regclass
      and con.contype = 'c'
      and att.attname = 'action'
  loop
    execute format('alter table public.task_block_events drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.task_block_events drop constraint if exists task_block_events_action_check;
alter table public.task_block_events add constraint task_block_events_action_check
  check (action in ('blocked', 'updated', 'cleared', 'resolution', 'resolution_acknowledged'));

alter table public.task_block_events
  add column if not exists detail text;

alter table public.task_block_events drop constraint if exists task_block_events_detail_len;
alter table public.task_block_events add constraint task_block_events_detail_len
  check (detail is null or char_length(detail) <= 8000);

comment on column public.task_block_events.detail is
  'Resolution text, or a short note, for resolution and resolution_acknowledged events.';

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_block_events enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.tasks from anon;
    revoke all on public.task_comments from anon;
    revoke all on public.task_block_events from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.tasks from authenticated;
    revoke all on public.task_comments from authenticated;
    revoke all on public.task_block_events from authenticated;
  end if;
end $$;
