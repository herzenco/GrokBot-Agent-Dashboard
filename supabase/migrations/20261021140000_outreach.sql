-- Outreach log for prospecting. Apply after 20261020140000_document_event_from_path.sql.
-- Schema only. No sample rows, and no agent or API key inserts.
-- Hondo (slug hondo) is added outside this migration.

create table public.outreach (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  person_name text not null,
  company text,
  title text,
  email text,
  linkedin_url text,
  channel text not null check (channel in ('email', 'linkedin', 'other')),
  contacted_at timestamptz not null default now(),
  message text,
  status text not null check (status in ('drafted', 'sent', 'replied', 'meeting')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_person_name_len check (char_length(person_name) between 1 and 200),
  constraint outreach_company_len check (company is null or char_length(company) <= 200),
  constraint outreach_title_len check (title is null or char_length(title) <= 200),
  constraint outreach_email_len check (email is null or char_length(email) <= 320),
  constraint outreach_linkedin_len check (linkedin_url is null or char_length(linkedin_url) <= 500),
  constraint outreach_message_len check (message is null or char_length(message) <= 8000),
  constraint outreach_source_len check (source_url is null or char_length(source_url) <= 1000),
  constraint outreach_has_contact check (email is not null or linkedin_url is not null)
);

comment on table public.outreach is
  'Prospecting log: who was contacted, on which channel, and whether they replied. No sample rows.';

create index outreach_agent_contacted_idx on public.outreach (agent_id, contacted_at desc);
create index outreach_status_contacted_idx on public.outreach (status, contacted_at desc);

create or replace function public.set_outreach_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger outreach_set_updated_at
before update on public.outreach
for each row
execute function public.set_outreach_updated_at();

alter table public.outreach enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on public.outreach to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.outreach from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.outreach from authenticated;
  end if;
end $$;
