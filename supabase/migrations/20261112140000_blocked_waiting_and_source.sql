-- Who a block is waiting on, and an optional http(s) source link.
-- Apply after 20261026163500_blocked_details_columns.sql. Do not edit that file.
-- reports.blocked is already jsonb. Structured report items stay in that array
-- (a string, or an object with title, reason, waiting_on, source_url, source_label).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE public.agent_status
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE public.agent_heartbeats
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.tasks.waiting_on IS
  'Who or what a blocked task is waiting on. Null when the task is not blocked.';
COMMENT ON COLUMN public.tasks.source_url IS
  'http or https link for a blocked task (Linear issue, GitHub PR, or other source). Null when the task is not blocked.';
COMMENT ON COLUMN public.agent_status.waiting_on IS
  'Who or what the current blocked status is waiting on. Null unless state is blocked.';
COMMENT ON COLUMN public.agent_status.source_url IS
  'http or https link for the current blocked status. Null unless state is blocked.';
