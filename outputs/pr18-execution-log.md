# PR #18 Cleanup Execution Log

**Branch:** `cleanup/proof-library-stale-rows`
**Executed:** 2026-05-27T00:16:48.240Z
**Execution path:** B (sequential PostgREST)
**Authorization:** Citlali (via Minervamon, msg 5831, 2026-05-27 00:06 UTC)

## Pre-snapshot
- Total documents rows for 8 filenames: 24
- Matches inventory packet (commit f45d1c4): yes
- Cron-retry state of spring-2025-newsletter.pdf: retry_count=1 (was 1 at packet time)

### All 24 rows at pre-snapshot time:
| short_id | file_name | processing_status | created_at | entry_count |
|---|---|---|---|---|
| 9c564dd6 | 2024-impact-report-board-edition.pdf | done | 2026-05-26T02:05:29.348151+00:00 | 16 |
| 83f480ce | 2024-impact-report-board-edition.pdf | done | 2026-05-26T01:58:16.240903+00:00 | 20 |
| 33b7a903 | 2024-impact-report-board-edition.pdf | done | 2026-05-26T01:44:28.560863+00:00 | 0 |
| e1f324e6 | 2025-Q1-programs-brief.pdf | done | 2026-05-26T02:05:29.81835+00:00 | 11 |
| 55f66310 | 2025-Q1-programs-brief.pdf | done | 2026-05-26T01:58:16.682889+00:00 | 11 |
| 4d0012be | 2025-Q1-programs-brief.pdf | done | 2026-05-26T01:44:29.129309+00:00 | 0 |
| 2e220d0e | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T02:05:28.289086+00:00 | 1 |
| 907632bd | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T01:58:15.326321+00:00 | 1 |
| e77dbc2d | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T01:44:27.38486+00:00 | 0 |
| d1dd3282 | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T02:05:27.419031+00:00 | 1 |
| 7d20eda6 | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T01:58:14.565755+00:00 | 1 |
| 06afd9ba | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T01:44:26.455235+00:00 | 1 |
| 267a5356 | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T02:05:28.832965+00:00 | 9 |
| b34d4fff | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T01:58:15.787889+00:00 | 10 |
| f2d52be8 | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T01:44:27.973556+00:00 | 0 |
| 5d5c00ac | mission-about-and-campaign-copy.pdf | done | 2026-05-26T02:05:31.200418+00:00 | 5 |
| 750a907d | mission-about-and-campaign-copy.pdf | done | 2026-05-26T01:58:18.089171+00:00 | 5 |
| 97f2b370 | mission-about-and-campaign-copy.pdf | done | 2026-05-26T01:44:30.856152+00:00 | 0 |
| fb9b34e0 | spring-2025-newsletter.pdf | done | 2026-05-26T02:05:30.764267+00:00 | 5 |
| c6e4871e | spring-2025-newsletter.pdf | failed | 2026-05-26T01:58:17.606071+00:00 | 0 |
| b82086f1 | spring-2025-newsletter.pdf | done | 2026-05-26T01:44:30.283423+00:00 | 0 |
| 1dcf96d9 | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T02:05:30.326294+00:00 | 14 |
| b129dfb6 | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T01:58:17.151669+00:00 | 19 |
| 3021fa4e | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T01:44:29.693232+00:00 | 0 |


## Pre-DELETE summary
### To delete (16 documents):
| short_id | file_name | processing_status | created_at | entry_count |
|---|---|---|---|---|
| 83f480ce | 2024-impact-report-board-edition.pdf | done | 2026-05-26T01:58:16.240903+00:00 | 20 |
| 33b7a903 | 2024-impact-report-board-edition.pdf | done | 2026-05-26T01:44:28.560863+00:00 | 0 |
| 55f66310 | 2025-Q1-programs-brief.pdf | done | 2026-05-26T01:58:16.682889+00:00 | 11 |
| 4d0012be | 2025-Q1-programs-brief.pdf | done | 2026-05-26T01:44:29.129309+00:00 | 0 |
| 907632bd | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T01:58:15.326321+00:00 | 1 |
| e77dbc2d | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T01:44:27.38486+00:00 | 0 |
| 7d20eda6 | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T01:58:14.565755+00:00 | 1 |
| 06afd9ba | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T01:44:26.455235+00:00 | 1 |
| b34d4fff | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T01:58:15.787889+00:00 | 10 |
| f2d52be8 | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T01:44:27.973556+00:00 | 0 |
| 750a907d | mission-about-and-campaign-copy.pdf | done | 2026-05-26T01:58:18.089171+00:00 | 5 |
| 97f2b370 | mission-about-and-campaign-copy.pdf | done | 2026-05-26T01:44:30.856152+00:00 | 0 |
| c6e4871e | spring-2025-newsletter.pdf | failed | 2026-05-26T01:58:17.606071+00:00 | 0 |
| b82086f1 | spring-2025-newsletter.pdf | done | 2026-05-26T01:44:30.283423+00:00 | 0 |
| b129dfb6 | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T01:58:17.151669+00:00 | 19 |
| 3021fa4e | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T01:44:29.693232+00:00 | 0 |


### To delete (~68 memory_entries):
| short_id | source (doc short id) | category |
|---|---|---|
| d18fdfe7 | 06afd9ba | prior_grants |
| e6f8f7f3 | 7d20eda6 | prior_grants |
| 670152c7 | 907632bd | prior_grants |
| 89d09baa | b34d4fff | outcomes |
| 40be1231 | b34d4fff | outcomes |
| 648b9494 | 750a907d | voice_samples |
| 4d7cbaed | b34d4fff | outcomes |
| 2a78c897 | b34d4fff | outcomes |
| 172ed288 | b34d4fff | outcomes |
| 5f184233 | b34d4fff | outcomes |
| b055354d | b34d4fff | outcomes |
| 2411f4e8 | b34d4fff | outcomes |
| 341ea345 | b34d4fff | outcomes |
| 7fc7cdb2 | b34d4fff | outcomes |
| 190eb66a | 83f480ce | outcomes |
| e81f4302 | 83f480ce | outcomes |
| 19a14bb6 | 83f480ce | outcomes |
| 35f813d8 | 83f480ce | outcomes |
| 317eb0e0 | 83f480ce | outcomes |
| 74c354f8 | 83f480ce | outcomes |
| bc511e9a | 83f480ce | outcomes |
| d9774134 | 83f480ce | outcomes |
| 12a4374c | 83f480ce | outcomes |
| 34f088a6 | 83f480ce | outcomes |
| 90a44584 | 83f480ce | outcomes |
| f4476a1d | 83f480ce | outcomes |
| d3b4d991 | 83f480ce | outcomes |
| 5ed6cbbc | 83f480ce | outcomes |
| d9aca659 | 83f480ce | outcomes |
| a45b7754 | 83f480ce | outcomes |
| cffc5500 | 83f480ce | outcomes |
| b2a5d749 | 83f480ce | outcomes |
| fd38b9bc | 83f480ce | outcomes |
| 322b6109 | 83f480ce | outcomes |
| d822f316 | 55f66310 | outcomes |
| e41a4a20 | 55f66310 | outcomes |
| 463e4148 | 55f66310 | outcomes |
| b6171116 | 55f66310 | outcomes |
| f33ed8db | 55f66310 | outcomes |
| 8493af12 | 55f66310 | outcomes |
| bab1638f | 55f66310 | outcomes |
| 215bfa39 | 55f66310 | outcomes |
| e010673c | 55f66310 | outcomes |
| 08e233d7 | 55f66310 | outcomes |
| bb427514 | 55f66310 | outcomes |
| 94faf8a4 | b129dfb6 | outcomes |
| cbf3e65f | b129dfb6 | outcomes |
| 98354964 | b129dfb6 | outcomes |
| 7fa7c549 | b129dfb6 | outcomes |
| a87468df | b129dfb6 | outcomes |
| 2baee233 | b129dfb6 | outcomes |
| 231df810 | b129dfb6 | outcomes |
| 85255e33 | b129dfb6 | outcomes |
| 56a4b8ee | b129dfb6 | outcomes |
| 6d196050 | b129dfb6 | outcomes |
| 07543aba | b129dfb6 | outcomes |
| 80035d07 | b129dfb6 | outcomes |
| 722ceb63 | b129dfb6 | outcomes |
| f6ad0dc7 | b129dfb6 | outcomes |
| 8e24321c | b129dfb6 | outcomes |
| cd6f145e | b129dfb6 | outcomes |
| 8daf0e00 | b129dfb6 | outcomes |
| 8e630b79 | b129dfb6 | outcomes |
| 4f4e35e1 | b129dfb6 | outcomes |
| aa8a6316 | 750a907d | voice_samples |
| fded342b | 750a907d | voice_samples |
| e6ce974c | 750a907d | voice_samples |
| fde3fe8d | 750a907d | voice_samples |


### To keep (8 documents):
| short_id | file_name | processing_status | created_at | entry_count |
|---|---|---|---|---|
| 9c564dd6 | 2024-impact-report-board-edition.pdf | done | 2026-05-26T02:05:29.348151+00:00 | 16 |
| e1f324e6 | 2025-Q1-programs-brief.pdf | done | 2026-05-26T02:05:29.81835+00:00 | 11 |
| 2e220d0e | DDCF-2024-grant-application-DECLINED.pdf | done | 2026-05-26T02:05:28.289086+00:00 | 1 |
| d1dd3282 | MEAF-2024-grant-application-FUNDED.pdf | done | 2026-05-26T02:05:27.419031+00:00 | 1 |
| 267a5356 | MEAF-Q4-2024-funder-report.pdf | done | 2026-05-26T02:05:28.832965+00:00 | 9 |
| 5d5c00ac | mission-about-and-campaign-copy.pdf | done | 2026-05-26T02:05:31.200418+00:00 | 5 |
| fb9b34e0 | spring-2025-newsletter.pdf | done | 2026-05-26T02:05:30.764267+00:00 | 5 |
| 1dcf96d9 | workforce-prep-pilot-outcomes-memo.pdf | done | 2026-05-26T02:05:30.326294+00:00 | 14 |


## Execution
- DELETE memory_entries: 68 rows removed (expected ~68)
- DELETE documents: 16 rows removed (expected 16)
- Transaction state: COMMITTED (PostgREST sequential)

## Post-snapshot
- documents remaining for 8 filenames: 8 (expected 8)
- memory_entries with source matching kept doc IDs: 62 (expected 62)
- Keepers all have memory_entries: yes

## Anomalies
none

## Storage cleanup status
NOT touched. Per Minervamon's instruction, Storage object cleanup at `org-documents/e07d3c8d-b921-4cbd-b5db-965c4e0fcbae/<doc_id>/<filename>` is a SEPARATE follow-up. 16 orphan storage objects remain.
