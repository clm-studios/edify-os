-- Migration 00041: Atomic draft-append helper for grants_pipeline (M3 fix)
--
-- Context: The PATCH /api/grants/pipeline/[id] handler had a read-modify-write
-- race on the drafts jsonb array: SELECT → JS append → UPDATE whole array.
-- Two concurrent PATCHes reading the same array caused the second write to
-- silently drop the first draft and duplicate version numbers.
--
-- Fix: replace the race with a single atomic SQL UPDATE that appends the new
-- draft object in-database, computing the next version number in the same
-- statement via jsonb_array_length(drafts)+1.
--
-- Manual apply: run this file in the Supabase SQL Editor (Citlali / Minervamon).
-- Same workflow as 00033/00036/00037/00038/00040.
-- APPLY THIS IN PROD BEFORE merging lopmon/m3-m5-pipeline-integrity: the function is additive and inert until the calling code deploys, so apply-first has no failure window; merge-first would 500 every draft-append until applied.

-- ---------------------------------------------------------------------------
-- append_pipeline_draft — atomic jsonb append + optional status advance
-- ---------------------------------------------------------------------------
-- Parameters:
--   p_id           uuid    — grants_pipeline row id
--   p_org_id       uuid    — caller's org (auth scope guard)
--   p_section      text    — draft section name
--   p_content_md   text    — draft markdown content
--   p_drafted_by_tool text — tool identifier (e.g. 'draft_grant_content')
--   p_drafted_at   text    — ISO-8601 timestamp string (passed from server)
--   p_auto_advance boolean — if true, advance status to 'drafting' when
--                            current status is 'discovered' or 'verification'
--                            (mirrors the auto-advance side-effect in the route)
--
-- Returns: the full updated grants_pipeline row (for the route to return).
--
-- Concurrency safety: single UPDATE with no preceding SELECT on drafts; the
-- jsonb_array_length expression and array append are evaluated atomically
-- inside Postgres's tuple lock, eliminating the read-modify-write window.

CREATE OR REPLACE FUNCTION public.append_pipeline_draft(
  p_id            uuid,
  p_org_id        uuid,
  p_section       text,
  p_content_md    text,
  p_drafted_by_tool text,
  p_drafted_at    text,
  p_auto_advance  boolean DEFAULT true
)
RETURNS SETOF public.grants_pipeline
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_draft jsonb;
  v_next_version int;
BEGIN
  -- Build the new draft object.  Version is computed from the live DB state
  -- inside this transaction — no JS read needed.
  SELECT jsonb_array_length(drafts) + 1
  INTO v_next_version
  FROM public.grants_pipeline
  WHERE id = p_id AND org_id = p_org_id
  FOR UPDATE;  -- row-level lock prevents concurrent appends racing

  IF NOT FOUND THEN
    RETURN;  -- caller interprets empty result set as 404
  END IF;

  v_new_draft := jsonb_build_object(
    'section',          p_section,
    'content_md',       p_content_md,
    'version',          v_next_version,
    'drafted_at',       p_drafted_at,
    'drafted_by_tool',  p_drafted_by_tool
  );

  RETURN QUERY
  UPDATE public.grants_pipeline
  SET
    drafts = drafts || jsonb_build_array(v_new_draft),
    status = CASE
      WHEN p_auto_advance
           AND status IN ('discovered', 'verification')
      THEN 'drafting'
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_id AND org_id = p_org_id
  RETURNING *;
END;
$$;

-- Grant execute to the service role so the server-side client can call it.
-- (The service role already bypasses RLS but the function itself uses
--  SECURITY DEFINER with an explicit org_id guard above.)
GRANT EXECUTE ON FUNCTION public.append_pipeline_draft(
  uuid, uuid, text, text, text, text, boolean
) TO service_role;
