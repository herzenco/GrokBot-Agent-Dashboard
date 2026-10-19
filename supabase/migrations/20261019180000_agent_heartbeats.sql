-- Live heartbeats for the board. Apply after 20261019120000_init.sql.
-- No sample rows: agents create these by posting /api/agent/status.
-- RLS stays on with no policies. The service role, used only by the Next.js server, writes these tables.

create table public.agent_status (
  agent_id uuid primary key references public.agents (id) on delete cascade,
  state text not null check (state in ('working', 'idle', 'blocked')),
  working_on text not null default '',
  updated_at timestamptz not null default now(),
  constraint agent_status_working_on_len check (char_length(working_on) <= 200)
);

comment on table public.agent_status is
  'Latest heartbeat per agent. updated_at is the server time of the last status post.';

create table public.agent_heartbeats (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  state text not null check (state in ('working', 'idle', 'blocked')),
  working_on text not null default '',
  created_at timestamptz not null default now(),
  constraint agent_heartbeats_working_on_len check (char_length(working_on) <= 200)
);

comment on table public.agent_heartbeats is
  'Append-only heartbeats. created_at is the server timestamp and is not taken from the client.';

create index agent_heartbeats_agent_created_idx
  on public.agent_heartbeats (agent_id, created_at desc);

create index agent_heartbeats_created_at_idx
  on public.agent_heartbeats (created_at desc);

alter table public.agent_status enable row level security;
alter table public.agent_heartbeats enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on public.agent_status to service_role;
    grant all privileges on public.agent_heartbeats to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.agent_status from anon;
    revoke all on public.agent_heartbeats from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.agent_status from authenticated;
    revoke all on public.agent_heartbeats from authenticated;
  end if;
end $$;
