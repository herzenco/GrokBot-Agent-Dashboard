-- Presence for chat-turn agents. A successful agent API call sets last_active.
-- The value is written by the Next.js server. Clients cannot send it.
-- No sample rows.

alter table public.agents
  add column last_active timestamptz;

comment on column public.agents.last_active is
  'Server time of the last successful agent API call: report, task create or update, document event, or status post.';
