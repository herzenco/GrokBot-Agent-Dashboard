ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS unblock_needed text;

ALTER TABLE public.agent_status
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS unblock_needed text;

ALTER TABLE public.agent_heartbeats
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS unblock_needed text;
