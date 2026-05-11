-- Migration 00036: Track assistant-message stream completion status.
--
-- Context (2026-05-11): when a long-running tool chain (find_grants_for_org,
-- render_design_to_image) blows past Vercel Hobby's 60s function ceiling, the
-- SSE stream is killed mid-flight. The frontend never receives a `done` event,
-- so its loading state stays on forever. Worse: the chat client rehydrates
-- messages from the DB on next mount, so the perpetual "thinking..." state
-- persists across page refresh.
--
-- Fix: give every assistant turn an explicit status. The streaming route
-- writes `'errored'` from its catch/finally block when the stream is aborted
-- or the handler throws, and the frontend renders a retry affordance instead
-- of the loading dots whenever it sees `status = 'errored'` on rehydrate.
--
-- Status values:
--   - 'complete' — normal happy path; the existing rows are backfilled to this
--   - 'streaming' — assistant turn started, no terminal event yet (transient)
--   - 'errored' — stream ended without a clean done event (timeout/abort/throw)
--
-- Manual apply: paste into the Supabase SQL Editor. Same workflow as 00027/00028.
-- Migration numbers 00034 and 00035 are reserved by Minervamon's Programs
-- Director PRD — do not reuse.

alter table public.messages
  add column if not exists status text not null default 'complete'
    check (status in ('streaming', 'complete', 'errored'));

-- Index lets the frontend rehydrate path filter to assistant turns in flight
-- without a full-table scan as the messages table grows.
create index if not exists idx_messages_status_partial
  on public.messages(conversation_id)
  where status <> 'complete';

comment on column public.messages.status is
  'Assistant-turn lifecycle: streaming (in flight) | complete (default) | errored (stream killed before done event). Set to errored from the chat route''s catch/finally so the frontend can render a retry affordance on rehydrate instead of perpetual loading dots.';
