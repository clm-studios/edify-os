# PR #17 Stale-Row Inventory Packet

**Branch:** `cleanup/proof-library-stale-rows`
**Generated:** 2026-05-26T23:50:37.649Z
**Source:** read-only PostgREST query against prod
**Org:** Edify (`e07d3c8d-b921-4cbd-b5db-965c4e0fcbae`)
**Filenames in scope:** 8 (from PR #17 seed script)

---

## Summary

- **Total rows for the 8 filenames:** 24
- **Expected keep set (processing_status='done', entry_count>0):** 16
- **Expected stale rows (everything else):** 8
- **Confirms Minervamon's "~24 stale" estimate:** no (actual stale count: 8)

> **Note on count discrepancy:** Minervamon estimated ~24 stale rows; actual is 8. The total row count is exactly 24, so the estimate likely conflated "total rows" with "stale rows." Prod state is 24 total = 16 keep + 8 stale. This is safe to proceed with — just flag the estimate was off by 3x before authorizing Step 4.

> **Edge case — MEAF-2024-grant-application-FUNDED.pdf:** All 3 rows for this filename are `done` with `entry_count > 0` (entry counts: 1, 1, 1). Under the standard stale definition (not-done OR entry_count=0), zero rows are "stale" for this file — but there are still 2 duplicate done rows with entries that should be deduplicated. The cleanup SQL's keep-latest logic should handle this, but Citlali should verify Step 2 of the SQL covers this case explicitly.

---

## Answers to Q1–Q3

### Q1 — Are stale rows uniformly entry_count=0?

**Yes — all 8 stale rows have entry_count=0.** No orphaned memory_entries will be left behind by a row-only DELETE. Safe to proceed with the cleanup SQL as written.

### Q2 — Was --force used on debug runs?

**Yes — --force was likely used.** The following 7 filenames have BOTH keep rows (done + entries) AND stale rows, meaning the same filename was uploaded multiple times and forced through the pipeline:

- `DDCF-2024-grant-application-DECLINED.pdf`: 3 total rows (2 keep, 1 stale)
- `MEAF-Q4-2024-funder-report.pdf`: 3 total rows (2 keep, 1 stale)
- `2024-impact-report-board-edition.pdf`: 3 total rows (2 keep, 1 stale)
- `2025-Q1-programs-brief.pdf`: 3 total rows (2 keep, 1 stale)
- `workforce-prep-pilot-outcomes-memo.pdf`: 3 total rows (2 keep, 1 stale)
- `spring-2025-newsletter.pdf`: 3 total rows (1 keep, 2 stale)
- `mission-about-and-campaign-copy.pdf`: 3 total rows (2 keep, 1 stale)

The keep-set query in the cleanup SQL (filtering by filename IN list + status='done') is correct — it will retain the canonical done rows and delete the duplicates.

**Per-filename row count breakdown:**

| file_name | total | keep (done+entries) | stale |
|---|---|---|---|
| MEAF-2024-grant-application-FUNDED.pdf | 3 | 3 | 0 |
| DDCF-2024-grant-application-DECLINED.pdf | 3 | 2 | 1 |
| MEAF-Q4-2024-funder-report.pdf | 3 | 2 | 1 |
| 2024-impact-report-board-edition.pdf | 3 | 2 | 1 |
| 2025-Q1-programs-brief.pdf | 3 | 2 | 1 |
| workforce-prep-pilot-outcomes-memo.pdf | 3 | 2 | 1 |
| spring-2025-newsletter.pdf | 3 | 1 | 2 |
| mission-about-and-campaign-copy.pdf | 3 | 2 | 1 |

### Q3 — Is the cron sweeper actively retrying stale rows?

**YES — 1 stale row is actively being retried by the cron sweeper.** This is wasting Anthropic spend until cleanup lands.

Rows being retried:
- `c6e4871e-c722-4950-a109-bd9df41eaa07` (`spring-2025-newsletter.pdf`, status=`failed`, retry_count=1, created=2026-05-26 01:58:17 UTC)

This row has `parsed_text_preview = "Failed to parse Claude extraction response"` — a hard failure from a PR #17 debug run that never resolved. The cron will retry it again (retry_count < 3) and spend tokens on a document that should be deleted. Mild urgency on cleanup authorization.

---

## Full inventory table

| id (short) | file_name | proc_status | size_b | retry | created_at (UTC) | entry_count | parsed_text_preview |
|---|---|---|---|---|---|---|---|
| 9c564dd6 | 2024-impact-report-board-edition.pdf | done | 23116 | 0 | 2026-05-26 02:05:29 | 16 | CLM Studios CLM Studios FY2024 Impact Report (Board Edition) Letter from the Exe |
| 83f480ce | 2024-impact-report-board-edition.pdf | done | 23116 | 0 | 2026-05-26 01:58:16 | 20 | CLM Studios CLM Studios FY2024 Impact Report (Board Edition) Letter from the Exe |
| 33b7a903 | 2024-impact-report-board-edition.pdf | done | 8572 | 0 | 2026-05-26 01:44:28 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| e1f324e6 | 2025-Q1-programs-brief.pdf | done | 17638 | 0 | 2026-05-26 02:05:29 | 11 | CLM Studios CLM Studios Q1 2025 Programs Brief (Internal) To / From / Date To: C |
| 55f66310 | 2025-Q1-programs-brief.pdf | done | 17638 | 0 | 2026-05-26 01:58:16 | 11 | CLM Studios CLM Studios Q1 2025 Programs Brief (Internal) To / From / Date To: C |
| 4d0012be | 2025-Q1-programs-brief.pdf | done | 6565 | 0 | 2026-05-26 01:44:29 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| 2e220d0e | DDCF-2024-grant-application-DECLINED.pdf | done | 26676 | 0 | 2026-05-26 02:05:28 | 1 | CLM Studios Grant Application Doris Duke Charitable Foundation Cover Letter Sept |
| 907632bd | DDCF-2024-grant-application-DECLINED.pdf | done | 26676 | 0 | 2026-05-26 01:58:15 | 1 | CLM Studios Grant Application Doris Duke Charitable Foundation Cover Letter Sept |
| e77dbc2d | DDCF-2024-grant-application-DECLINED.pdf | done | 10349 | 0 | 2026-05-26 01:44:27 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| d1dd3282 | MEAF-2024-grant-application-FUNDED.pdf | done | 32198 | 0 | 2026-05-26 02:05:27 | 1 | CLM Studios Grant Application Mitsubishi Electric America Foundation Cover Lette |
| 7d20eda6 | MEAF-2024-grant-application-FUNDED.pdf | done | 32198 | 0 | 2026-05-26 01:58:14 | 1 | CLM Studios Grant Application Mitsubishi Electric America Foundation Cover Lette |
| 06afd9ba | MEAF-2024-grant-application-FUNDED.pdf | done | 12326 | 0 | 2026-05-26 01:44:26 | 1 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| 267a5356 | MEAF-Q4-2024-funder-report.pdf | done | 22227 | 0 | 2026-05-26 02:05:28 | 9 | CLM Studios Interim Progress Report Mitsubishi Electric America Foundation Grant |
| b34d4fff | MEAF-Q4-2024-funder-report.pdf | done | 22227 | 0 | 2026-05-26 01:58:15 | 10 | CLM Studios Interim Progress Report Mitsubishi Electric America Foundation Grant |
| f2d52be8 | MEAF-Q4-2024-funder-report.pdf | done | 8628 | 0 | 2026-05-26 01:44:27 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| 5d5c00ac | mission-about-and-campaign-copy.pdf | done | 17822 | 0 | 2026-05-26 02:05:31 | 5 | CLM Studios CLM Studios Mission, About, and Campaign Copy (Spring 2025) About CL |
| 750a907d | mission-about-and-campaign-copy.pdf | done | 17822 | 0 | 2026-05-26 01:58:18 | 5 | CLM Studios CLM Studios Mission, About, and Campaign Copy (Spring 2025) About CL |
| 97f2b370 | mission-about-and-campaign-copy.pdf | done | 6625 | 0 | 2026-05-26 01:44:30 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| fb9b34e0 | spring-2025-newsletter.pdf | done | 23160 | 0 | 2026-05-26 02:05:30 | 5 | CLM Studios CLM Studios Spring 2025 Supporter Newsletter Letter from Our Founder |
| c6e4871e | spring-2025-newsletter.pdf | failed | 23160 | 1 | 2026-05-26 01:58:17 | 0 | Failed to parse Claude extraction response |
| b82086f1 | spring-2025-newsletter.pdf | done | 8807 | 0 | 2026-05-26 01:44:30 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |
| 1dcf96d9 | workforce-prep-pilot-outcomes-memo.pdf | done | 24557 | 0 | 2026-05-26 02:05:30 | 14 | CLM Studios Hope Pathways Three-Cohort Outcomes Memo (FY2024) Purpose and Scope  |
| b129dfb6 | workforce-prep-pilot-outcomes-memo.pdf | done | 24557 | 0 | 2026-05-26 01:58:17 | 19 | CLM Studios Hope Pathways Three-Cohort Outcomes Memo (FY2024) Purpose and Scope  |
| 3021fa4e | workforce-prep-pilot-outcomes-memo.pdf | done | 9002 | 0 | 2026-05-26 01:44:29 | 0 | %PDF-1.3 % 7 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Content |

Sort: file_name ASC, created_at DESC. Use 8-char id prefixes. Full IDs in appendix below.

---

## Appendix: full doc IDs

- `9c564dd6-d315-4c15-9835-28ecd56061bd` — 2024-impact-report-board-edition.pdf — 2026-05-26 02:05:29 UTC — done — entry_count=16
- `83f480ce-aaac-471c-8dfb-893f06080bf4` — 2024-impact-report-board-edition.pdf — 2026-05-26 01:58:16 UTC — done — entry_count=20
- `33b7a903-061b-4cb1-ada7-17976ef1c416` — 2024-impact-report-board-edition.pdf — 2026-05-26 01:44:28 UTC — done — entry_count=0 *(stale)*
- `e1f324e6-f765-4eb6-b974-7b158b65e1db` — 2025-Q1-programs-brief.pdf — 2026-05-26 02:05:29 UTC — done — entry_count=11
- `55f66310-fd89-4106-8d80-aee02c823a02` — 2025-Q1-programs-brief.pdf — 2026-05-26 01:58:16 UTC — done — entry_count=11
- `4d0012be-914c-426a-916f-c6852088e1bc` — 2025-Q1-programs-brief.pdf — 2026-05-26 01:44:29 UTC — done — entry_count=0 *(stale)*
- `2e220d0e-6e0f-4e4e-88a7-192607242410` — DDCF-2024-grant-application-DECLINED.pdf — 2026-05-26 02:05:28 UTC — done — entry_count=1
- `907632bd-eb84-4e18-a519-6a4b692bea18` — DDCF-2024-grant-application-DECLINED.pdf — 2026-05-26 01:58:15 UTC — done — entry_count=1
- `e77dbc2d-74ee-44c1-8f73-cd9716bc4837` — DDCF-2024-grant-application-DECLINED.pdf — 2026-05-26 01:44:27 UTC — done — entry_count=0 *(stale)*
- `d1dd3282-4a31-4273-baea-ec531a0b55b4` — MEAF-2024-grant-application-FUNDED.pdf — 2026-05-26 02:05:27 UTC — done — entry_count=1
- `7d20eda6-a4fa-40e8-8abd-94667c581bd7` — MEAF-2024-grant-application-FUNDED.pdf — 2026-05-26 01:58:14 UTC — done — entry_count=1
- `06afd9ba-10f2-4c68-8a40-4660ade481bb` — MEAF-2024-grant-application-FUNDED.pdf — 2026-05-26 01:44:26 UTC — done — entry_count=1 *(all 3 are done; oldest 2 are dedup candidates)*
- `267a5356-a57e-4486-8fa8-42aa6a1b228f` — MEAF-Q4-2024-funder-report.pdf — 2026-05-26 02:05:28 UTC — done — entry_count=9
- `b34d4fff-b92c-4426-bb52-b90670582e08` — MEAF-Q4-2024-funder-report.pdf — 2026-05-26 01:58:15 UTC — done — entry_count=10
- `f2d52be8-ac0c-4f77-a1cc-d024e8f2b916` — MEAF-Q4-2024-funder-report.pdf — 2026-05-26 01:44:27 UTC — done — entry_count=0 *(stale)*
- `5d5c00ac-ed0d-4ad7-bf49-f3603bcd29e3` — mission-about-and-campaign-copy.pdf — 2026-05-26 02:05:31 UTC — done — entry_count=5
- `750a907d-6fa6-4706-abf5-08b1ef5157d8` — mission-about-and-campaign-copy.pdf — 2026-05-26 01:58:18 UTC — done — entry_count=5
- `97f2b370-ec3b-4b0f-8ee5-75fb5fe9d5d9` — mission-about-and-campaign-copy.pdf — 2026-05-26 01:44:30 UTC — done — entry_count=0 *(stale)*
- `fb9b34e0-2850-4967-bc6a-9edb4f656d29` — spring-2025-newsletter.pdf — 2026-05-26 02:05:30 UTC — done — entry_count=5
- `c6e4871e-c722-4950-a109-bd9df41eaa07` — spring-2025-newsletter.pdf — 2026-05-26 01:58:17 UTC — **failed** — entry_count=0 *(stale, CRON RETRYING)*
- `b82086f1-7abc-4a8f-95cd-86aacc65d00a` — spring-2025-newsletter.pdf — 2026-05-26 01:44:30 UTC — done — entry_count=0 *(stale)*
- `1dcf96d9-5572-4a88-be30-47ecebe64c07` — workforce-prep-pilot-outcomes-memo.pdf — 2026-05-26 02:05:30 UTC — done — entry_count=14
- `b129dfb6-866a-4561-a093-1c58741bbe96` — workforce-prep-pilot-outcomes-memo.pdf — 2026-05-26 01:58:17 UTC — done — entry_count=19
- `3021fa4e-a12b-4030-b860-3142360486b8` — workforce-prep-pilot-outcomes-memo.pdf — 2026-05-26 01:44:29 UTC — done — entry_count=0 *(stale)*

---

## Per-filename breakdown

### `MEAF-2024-grant-application-FUNDED.pdf`
- **Total rows:** 3
- **Done with entries:** 3 (keep candidates — all 3 are done)
- **Failed / pending / stale-done:** 0 (stale candidates by standard definition)
- **No stale rows for this filename**
- **NOTE:** All 3 rows are `done` with `entry_count=1`. The 2 older rows (01:58:14, 01:44:26) are dedup candidates that the cleanup SQL's keep-latest logic should target. Verify the SQL handles this case.

### `DDCF-2024-grant-application-DECLINED.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:27 UTC
- **Latest stale created_at:** 2026-05-26 01:44:27 UTC

### `MEAF-Q4-2024-funder-report.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:27 UTC
- **Latest stale created_at:** 2026-05-26 01:44:27 UTC

### `2024-impact-report-board-edition.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:28 UTC
- **Latest stale created_at:** 2026-05-26 01:44:28 UTC

### `2025-Q1-programs-brief.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:29 UTC
- **Latest stale created_at:** 2026-05-26 01:44:29 UTC

### `workforce-prep-pilot-outcomes-memo.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:29 UTC
- **Latest stale created_at:** 2026-05-26 01:44:29 UTC

### `spring-2025-newsletter.pdf`
- **Total rows:** 3
- **Done with entries:** 1 (keep candidate)
- **Failed / pending / stale-done:** 2 (stale candidates — 1 failed with active cron retry, 1 early done with 0 entries)
- **Earliest stale created_at:** 2026-05-26 01:44:30 UTC
- **Latest stale created_at:** 2026-05-26 01:58:17 UTC

### `mission-about-and-campaign-copy.pdf`
- **Total rows:** 3
- **Done with entries:** 2 (keep candidates)
- **Failed / pending / stale-done:** 1 (stale candidates)
- **Earliest stale created_at:** 2026-05-26 01:44:30 UTC
- **Latest stale created_at:** 2026-05-26 01:44:30 UTC

---

## Read-only verification

This packet was generated by read-only GET requests to PostgREST (`/rest/v1/documents` and `/rest/v1/memory_entries`). **No DELETE, UPDATE, or INSERT was issued.** The service-role key was used for read access only. No data was modified.

**Cleanup execution remains PENDING Citlali-in-loop authorization.** Run Steps 1-4 of `scripts/cleanup-stale-proof-library-rows.sql` in Supabase SQL editor, in order, after reviewing this packet.
