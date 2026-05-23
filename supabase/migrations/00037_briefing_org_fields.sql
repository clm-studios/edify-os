-- Migration 00037: Add detailed org fields from briefing form + org_profile memory category
--
-- Context: Sprint A org-creation onboarding flow. The briefing form at
-- /dashboard/briefing collects org detail fields that have no home in the
-- orgs table yet. This migration adds them, then adds the org_profile category
-- to memory_entries so the org-profile preamble (F3) can be stored as a
-- searchable memory entry.
--
-- Manual apply: run this file in the Supabase SQL Editor (Citlali). Same
-- workflow as 00033/00036.

-- ---------------------------------------------------------------------------
-- 1. Extend orgs table with briefing-form fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS annual_budget text,
  ADD COLUMN IF NOT EXISTS full_time_staff text,
  ADD COLUMN IF NOT EXISTS regular_volunteers text,
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS primary_service_area text,
  ADD COLUMN IF NOT EXISTS founded_year text;

-- ---------------------------------------------------------------------------
-- 2. Add org_profile category to memory_entries
-- ---------------------------------------------------------------------------
-- org_profile stores the auto-generated org-profile preamble written at
-- briefing completion. It is consumed by archetype system prompts as
-- standing context for every conversation.

ALTER TABLE public.memory_entries DROP CONSTRAINT IF EXISTS memory_entries_category_check;

ALTER TABLE public.memory_entries ADD CONSTRAINT memory_entries_category_check
  CHECK (category IN (
    'mission', 'programs', 'donors', 'grants', 'campaigns',
    'brand_voice', 'contacts', 'processes', 'general',
    'financials', 'volunteers', 'events',
    'org_profile'
  ));
