-- Remember the previous vault path on a moved document event.
-- No sample rows.

alter table public.document_events
  add column from_path text;

comment on column public.document_events.from_path is
  'Previous vault path recorded on a moved event. Null for other actions, and null when a move had no from_path.';
