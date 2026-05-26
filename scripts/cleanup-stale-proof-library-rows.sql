-- scripts/cleanup-stale-proof-library-rows.sql
--
-- PURPOSE: Clean up ~24 stale `documents` rows in prod from PR #17 debug runs.
--          Keeps the 8 successful final-run rows; deletes the rest.
--
-- AUTHORIZATION: PENDING CITLALI-IN-LOOP AUTHORIZATION. DO NOT RUN.
--   - Steps 1-3 are READ-ONLY and safe to run as inspection queries.
--   - Step 4 is the transactional DELETE. Wrapped in BEGIN/.../COMMIT.
--     Run Steps 1-3 first, eyeball expected counts, THEN run Step 4.
--   - Step 5 (Supabase Storage object cleanup) is a SEPARATE follow-up.
--     See PR #17 review §245 — handle via Storage API, not SQL.
--     DELETing documents rows leaves orphaned Storage objects under
--     org-documents/<UUID>/<doc_id>/<filename>. Handle separately via the
--     Supabase Storage API: client.storage.from('org-documents').remove([...paths])
--     Do NOT SQL-delete storage.objects directly — that table is RLS-policy-guarded
--     and bypassing it can leave the bucket inconsistent.
--
-- TARGET ORG: Edify (uuid: e07d3c8d-b921-4cbd-b5db-965c4e0fcbae)
-- DOCS IN SCOPE: 8 filenames from PR #17 seed script (see WHERE clauses below)
--
-- HOW TO RUN: Supabase SQL editor or psql. No JS runner.
--             Run sections individually, top-to-bottom.
--             DO NOT execute Step 4 until Steps 1-3 output has been reviewed
--             and Citlali has authorized execution in person.

-- =============================================================================
-- Step 1 — Inventory (READ-ONLY)
-- =============================================================================

-- Identify all seed-script documents for the Edify org.
-- Expect ~32 rows: 8 successful final-run + ~24 stale debug-run rows.
SELECT
  d.id,
  d.file_name,
  d.processing_status,
  d.file_size_bytes,
  d.retry_count,
  d.created_at,
  d.storage_path,
  LEFT(COALESCE(d.parsed_text, ''), 80) AS parsed_text_preview,
  (SELECT COUNT(*) FROM memory_entries me
   WHERE me.source = 'document:' || d.id::text) AS entry_count
FROM documents d
WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
  AND d.file_name IN (
    'MEAF-2024-grant-application-FUNDED.pdf',
    'DDCF-2024-grant-application-DECLINED.pdf',
    'MEAF-Q4-2024-funder-report.pdf',
    '2024-impact-report-board-edition.pdf',
    '2025-Q1-programs-brief.pdf',
    'workforce-prep-pilot-outcomes-memo.pdf',
    'spring-2025-newsletter.pdf',
    'mission-about-and-campaign-copy.pdf'
  )
ORDER BY d.file_name, d.created_at DESC;

-- Expected shape:
-- - Keepers (8): processing_status='done', entry_count > 0, created_at ~2026-05-26 02:00 UTC,
--   file_size_bytes 6-12 KB.
-- - Stale (~24): earlier timestamps, smaller/compressed bytes, entry_count = 0,
--   parsed_text contains error strings.

-- =============================================================================
-- Step 2 — Verify the keep-set (READ-ONLY)
-- =============================================================================

-- For each of the 8 filenames, select the single most-recent row that has
-- processing_status='done' AND at least one memory_entries child.
-- This defines exactly which 8 rows will be KEPT in Step 4.
WITH keep_set AS (
  SELECT DISTINCT ON (d.file_name) d.id
  FROM documents d
  WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
    AND d.file_name IN (
      'MEAF-2024-grant-application-FUNDED.pdf',
      'DDCF-2024-grant-application-DECLINED.pdf',
      'MEAF-Q4-2024-funder-report.pdf',
      '2024-impact-report-board-edition.pdf',
      '2025-Q1-programs-brief.pdf',
      'workforce-prep-pilot-outcomes-memo.pdf',
      'spring-2025-newsletter.pdf',
      'mission-about-and-campaign-copy.pdf'
    )
    AND d.processing_status = 'done'
    AND EXISTS (SELECT 1 FROM memory_entries me
                WHERE me.source = 'document:' || d.id::text)
  ORDER BY d.file_name, d.created_at DESC
)
SELECT * FROM keep_set;

-- MUST return exactly 8 rows. If fewer, STOP — keep-set logic doesn't match prod state.
-- Re-examine Step 1 output and consult Lopmon before proceeding.

-- =============================================================================
-- Step 3 — Orphan check (READ-ONLY)
-- =============================================================================

-- Check whether any stale (to-be-deleted) documents rows have memory_entries
-- children. These would become orphaned by a row-only DELETE.
-- Stale rows should have entry_count = 0 (confirmed in Step 1), but verify here.
WITH keep_set AS (
  SELECT DISTINCT ON (d.file_name) d.id
  FROM documents d
  WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
    AND d.file_name IN (
      'MEAF-2024-grant-application-FUNDED.pdf',
      'DDCF-2024-grant-application-DECLINED.pdf',
      'MEAF-Q4-2024-funder-report.pdf',
      '2024-impact-report-board-edition.pdf',
      '2025-Q1-programs-brief.pdf',
      'workforce-prep-pilot-outcomes-memo.pdf',
      'spring-2025-newsletter.pdf',
      'mission-about-and-campaign-copy.pdf'
    )
    AND d.processing_status = 'done'
    AND EXISTS (SELECT 1 FROM memory_entries me
                WHERE me.source = 'document:' || d.id::text)
  ORDER BY d.file_name, d.created_at DESC
)
SELECT d.id, d.file_name, COUNT(me.id) AS orphaned_entries_if_deleted
FROM documents d
LEFT JOIN memory_entries me ON me.source = 'document:' || d.id::text
WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
  AND d.file_name IN (
    'MEAF-2024-grant-application-FUNDED.pdf',
    'DDCF-2024-grant-application-DECLINED.pdf',
    'MEAF-Q4-2024-funder-report.pdf',
    '2024-impact-report-board-edition.pdf',
    '2025-Q1-programs-brief.pdf',
    'workforce-prep-pilot-outcomes-memo.pdf',
    'spring-2025-newsletter.pdf',
    'mission-about-and-campaign-copy.pdf'
  )
  AND d.id NOT IN (SELECT id FROM keep_set)
GROUP BY d.id, d.file_name
HAVING COUNT(me.id) > 0;

-- If this returns ANY rows, those memory_entries will be orphaned by row-only deletion.
-- Decide: either DELETE those memory_entries FIRST (add a query above this block),
-- or confirm intentional retention, before running Step 4.
-- Expected result: 0 rows (stale debug runs never completed extraction).

-- =============================================================================
-- Step 4 — Candidate DELETE (DO NOT RUN until Steps 1-3 pass + Citlali authorizes)
-- =============================================================================

-- AUTHORIZATION GATE: Do NOT execute this block until:
--   (a) Step 1 shows ~32 total rows (~8 keepers + ~24 stale)
--   (b) Step 2 returns exactly 8 rows
--   (c) Step 3 returns 0 rows (no orphaned memory_entries)
--   (d) Citlali has explicitly authorized execution in person

BEGIN;

-- First, count how many rows will be deleted (sanity check before DELETE).
WITH keep_set AS (
  SELECT DISTINCT ON (d.file_name) d.id
  FROM documents d
  WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
    AND d.file_name IN (
      'MEAF-2024-grant-application-FUNDED.pdf',
      'DDCF-2024-grant-application-DECLINED.pdf',
      'MEAF-Q4-2024-funder-report.pdf',
      '2024-impact-report-board-edition.pdf',
      '2025-Q1-programs-brief.pdf',
      'workforce-prep-pilot-outcomes-memo.pdf',
      'spring-2025-newsletter.pdf',
      'mission-about-and-campaign-copy.pdf'
    )
    AND d.processing_status = 'done'
    AND EXISTS (SELECT 1 FROM memory_entries me
                WHERE me.source = 'document:' || d.id::text)
  ORDER BY d.file_name, d.created_at DESC
)
SELECT COUNT(*) AS rows_to_delete
FROM documents d
WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
  AND d.file_name IN (
    'MEAF-2024-grant-application-FUNDED.pdf',
    'DDCF-2024-grant-application-DECLINED.pdf',
    'MEAF-Q4-2024-funder-report.pdf',
    '2024-impact-report-board-edition.pdf',
    '2025-Q1-programs-brief.pdf',
    'workforce-prep-pilot-outcomes-memo.pdf',
    'spring-2025-newsletter.pdf',
    'mission-about-and-campaign-copy.pdf'
  )
  AND d.id NOT IN (SELECT id FROM keep_set);
-- Expect ~24. If wildly off (0, or 100+), run ROLLBACK and reinvestigate.

-- Perform the DELETE.
WITH keep_set AS (
  SELECT DISTINCT ON (d.file_name) d.id
  FROM documents d
  WHERE d.org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
    AND d.file_name IN (
      'MEAF-2024-grant-application-FUNDED.pdf',
      'DDCF-2024-grant-application-DECLINED.pdf',
      'MEAF-Q4-2024-funder-report.pdf',
      '2024-impact-report-board-edition.pdf',
      '2025-Q1-programs-brief.pdf',
      'workforce-prep-pilot-outcomes-memo.pdf',
      'spring-2025-newsletter.pdf',
      'mission-about-and-campaign-copy.pdf'
    )
    AND d.processing_status = 'done'
    AND EXISTS (SELECT 1 FROM memory_entries me
                WHERE me.source = 'document:' || d.id::text)
  ORDER BY d.file_name, d.created_at DESC
)
DELETE FROM documents
WHERE org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
  AND file_name IN (
    'MEAF-2024-grant-application-FUNDED.pdf',
    'DDCF-2024-grant-application-DECLINED.pdf',
    'MEAF-Q4-2024-funder-report.pdf',
    '2024-impact-report-board-edition.pdf',
    '2025-Q1-programs-brief.pdf',
    'workforce-prep-pilot-outcomes-memo.pdf',
    'spring-2025-newsletter.pdf',
    'mission-about-and-campaign-copy.pdf'
  )
  AND id NOT IN (SELECT id FROM keep_set);

-- Post-delete verification: confirm exactly 8 rows remain.
SELECT COUNT(*) AS remaining_rows
FROM documents
WHERE org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
  AND file_name IN (
    'MEAF-2024-grant-application-FUNDED.pdf',
    'DDCF-2024-grant-application-DECLINED.pdf',
    'MEAF-Q4-2024-funder-report.pdf',
    '2024-impact-report-board-edition.pdf',
    '2025-Q1-programs-brief.pdf',
    'workforce-prep-pilot-outcomes-memo.pdf',
    'spring-2025-newsletter.pdf',
    'mission-about-and-campaign-copy.pdf'
  );
-- Expect exactly 8. If not 8, ROLLBACK instead.

COMMIT;  -- Only after manual verification of rows_to_delete and remaining_rows counts.

-- After COMMIT, also spot-check the keep-set is healthy:
-- SELECT id, file_name, processing_status, created_at
-- FROM documents
-- WHERE org_id = 'e07d3c8d-b921-4cbd-b5db-965c4e0fcbae'
--   AND file_name IN (
--     'MEAF-2024-grant-application-FUNDED.pdf',
--     'DDCF-2024-grant-application-DECLINED.pdf',
--     'MEAF-Q4-2024-funder-report.pdf',
--     '2024-impact-report-board-edition.pdf',
--     '2025-Q1-programs-brief.pdf',
--     'workforce-prep-pilot-outcomes-memo.pdf',
--     'spring-2025-newsletter.pdf',
--     'mission-about-and-campaign-copy.pdf'
--   );

-- =============================================================================
-- Step 5 — Storage cleanup (NOT IN THIS FILE — SEPARATE FOLLOW-UP)
-- =============================================================================
-- DELETing documents rows leaves orphaned Storage objects under
-- org-documents/e07d3c8d-b921-4cbd-b5db-965c4e0fcbae/<doc_id>/<filename>.
-- Handle separately via the Supabase Storage API:
--   client.storage.from('org-documents').remove([...paths])
-- Do NOT SQL-delete storage.objects directly — that table is RLS-policy-guarded
-- and bypassing it can leave the bucket inconsistent.
-- See PR #17 review §245 for the full Storage cleanup pattern.
