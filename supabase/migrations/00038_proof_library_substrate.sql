-- Migration 00038: Proof Library Substrate (Sprint A.5)
--
-- Context: Sprint A.5 builds the typed proof library on top of existing
-- memory_entries and documents tables. This migration:
--   1. Adds three new memory categories (outcomes, prior_grants, voice_samples)
--   2. Adds a JSONB data column to memory_entries for structured per-category fields
--   3. Adds retry_count + last_attempted_at to documents for sweeper retry logic
--   4. Creates the org-documents Supabase Storage bucket
--
-- Manual apply: run this file in the Supabase SQL Editor (Citlali).
-- Same workflow as 00033/00036/00037.

-- ---------------------------------------------------------------------------
-- 1. Extend memory_entries with JSONB data column
-- ---------------------------------------------------------------------------
-- Existing rows use content only; data defaults to NULL for backwards
-- compatibility. Archetypes read content for free-text injection; tools
-- query data for structured field lookups (e.g. data->>'year' = '2025').

ALTER TABLE public.memory_entries
  ADD COLUMN IF NOT EXISTS data JSONB;

-- ---------------------------------------------------------------------------
-- 2. Expand memory_entries category constraint
-- ---------------------------------------------------------------------------
-- org_profile was added in 00037. This adds the three proof library categories.

ALTER TABLE public.memory_entries DROP CONSTRAINT IF EXISTS memory_entries_category_check;

ALTER TABLE public.memory_entries ADD CONSTRAINT memory_entries_category_check
  CHECK (category IN (
    'mission', 'programs', 'donors', 'grants', 'campaigns',
    'brand_voice', 'contacts', 'processes', 'general',
    'financials', 'volunteers', 'events',
    'org_profile',     -- Sprint A
    'outcomes',        -- Sprint A.5: quantitative impact data
    'prior_grants',    -- Sprint A.5: historical grant awards/applications
    'voice_samples'    -- Sprint A.5: org communication voice/style samples
  ));

-- ---------------------------------------------------------------------------
-- 3. Add retry columns to documents table
-- ---------------------------------------------------------------------------
-- retry_count: number of times the sweeper has attempted extraction.
-- last_attempted_at: timestamp of last extraction attempt.
-- Together these let the sweeper distinguish "never tried" from "tried and
-- failed" and cap retries at 3 before marking failed.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;

-- Index to speed up the sweeper's "pending docs due for retry" query.
CREATE INDEX IF NOT EXISTS idx_documents_pending_extraction
  ON public.documents (org_id, processing_status, retry_count, last_attempted_at)
  WHERE processing_status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. Create org-documents Storage bucket
-- ---------------------------------------------------------------------------
-- Private bucket (public = false). Path scheme: <orgId>/<docId>/<filename>
-- Access: service-role client only. Download proxy at /api/documents/[docId]
-- authenticates the requester's orgId before streaming bytes.

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-documents', 'org-documents', false)
ON CONFLICT (id) DO NOTHING;
