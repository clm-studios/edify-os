#!/usr/bin/env tsx
/**
 * cleanup-orphan-storage-objects.ts
 *
 * ============================================================
 * PENDING CITLALI-IN-LOOP AUTHORIZATION — DO NOT RUN
 * ============================================================
 * This script deletes 16 orphan PDF objects from Supabase Storage
 * that were left behind by PR #18's DB cleanup (documents rows +
 * memory_entries deleted; Storage objects NOT touched).
 *
 * Requires --confirm-citlali-auth flag to run (exits 1 without it).
 * Use --dry-run first to verify paths before authorizing a live run.
 *
 * Bucket:  org-documents
 * Prefix:  e07d3c8d-b921-4cbd-b5db-965c4e0fcbae/<doc_uuid>/<filename>
 *
 * Source data:
 *   outputs/pr18-execution-log.md  — 16 short doc IDs + filenames
 *   outputs/pr17-stale-row-inventory.md  — full UUIDs (appendix)
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN = args.includes("--dry-run");
const CONFIRM_CITLALI_AUTH = args.includes("--confirm-citlali-auth");
const SHOW_HELP = args.includes("--help") || args.includes("-h");

// --org-id <uuid>: required
const orgIdFlagIndex = args.indexOf("--org-id");
const ORG_ID_FLAG: string | null =
  orgIdFlagIndex !== -1 ? (args[orgIdFlagIndex + 1] ?? null) : null;

if (SHOW_HELP) {
  console.log(`
cleanup-orphan-storage-objects — Delete 16 orphan PDFs from Supabase Storage (PR #18 follow-up)

PENDING CITLALI-IN-LOOP AUTHORIZATION — DO NOT RUN without explicit auth.

Usage:
  pnpm --filter web cleanup-orphan-storage-objects --org-id <uuid> --confirm-citlali-auth [--dry-run]

Required:
  --org-id <uuid>          The Edify org UUID (e07d3c8d-b921-4cbd-b5db-965c4e0fcbae)
  --confirm-citlali-auth   Explicit authorization gate. Pass ONLY after Citlali authorizes in person.

Flags:
  --dry-run   Print what would be deleted; do NOT delete. Recommended first run.
  --help      Show this message.

Requires apps/web/.env.local with:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Authorization gate (belt-and-suspenders: must pass flag explicitly)
// ---------------------------------------------------------------------------

if (!CONFIRM_CITLALI_AUTH && !DRY_RUN) {
  console.error(`
ERROR: Missing required flag --confirm-citlali-auth.

This script deletes 16 orphan PDF objects from Supabase Storage.
It MUST NOT run without Citlali's explicit in-person authorization.

To perform a safe dry run first:
  pnpm --filter web cleanup-orphan-storage-objects --org-id <uuid> --dry-run

To execute after authorization:
  pnpm --filter web cleanup-orphan-storage-objects --org-id <uuid> --confirm-citlali-auth

DO NOT pass --confirm-citlali-auth unless Citlali has explicitly greenlit this run.
`);
  process.exit(1);
}

// Validate --org-id
if (!ORG_ID_FLAG) {
  console.error(
    "ERROR: --org-id <uuid> is required.\n" +
    "Example: --org-id e07d3c8d-b921-4cbd-b5db-965c4e0fcbae"
  );
  process.exit(1);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(ORG_ID_FLAG)) {
  console.error(
    `ERROR: --org-id "${ORG_ID_FLAG}" is not a valid UUID.\n` +
    "Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env loading (matches seed-proof-library-clm.ts pattern — no external dotenv)
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
// Worktree fallback: main repo is 3 levels up from worktree root
const MAIN_REPO_ROOT = path.resolve(REPO_ROOT, "..", "..", "..");
const ENV_PATH_MAIN = path.join(MAIN_REPO_ROOT, "apps", "web", ".env.local");

function loadEnv(): Record<string, string> {
  let envPath = ENV_PATH;
  if (!fs.existsSync(envPath)) {
    envPath = ENV_PATH_MAIN;
  }
  if (!fs.existsSync(envPath)) {
    console.error(
      `ERROR: .env.local not found at:\n  ${ENV_PATH}\n  ${ENV_PATH_MAIN}`
    );
    process.exit(1);
  }
  console.log(`[env] Loading from: ${envPath}`);
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Hardcoded paths — 16 orphan Storage objects to delete
//
// Source: outputs/pr17-stale-row-inventory.md appendix (full UUIDs)
//         cross-referenced with outputs/pr18-execution-log.md (to-delete list)
//
// Format: <org_uuid>/<doc_uuid>/<filename>
// Bucket: org-documents
// ---------------------------------------------------------------------------

const ORG_UUID = "e07d3c8d-b921-4cbd-b5db-965c4e0fcbae";

interface OrphanEntry {
  shortId: string;
  fullUuid: string;
  fileName: string;
  storagePath: string;
}

const ORPHAN_ENTRIES: OrphanEntry[] = [
  // 2024-impact-report-board-edition.pdf (2 orphans)
  {
    shortId: "83f480ce",
    fullUuid: "83f480ce-aaac-471c-8dfb-893f06080bf4",
    fileName: "2024-impact-report-board-edition.pdf",
    storagePath: `${ORG_UUID}/83f480ce-aaac-471c-8dfb-893f06080bf4/2024-impact-report-board-edition.pdf`,
  },
  {
    shortId: "33b7a903",
    fullUuid: "33b7a903-061b-4cb1-ada7-17976ef1c416",
    fileName: "2024-impact-report-board-edition.pdf",
    storagePath: `${ORG_UUID}/33b7a903-061b-4cb1-ada7-17976ef1c416/2024-impact-report-board-edition.pdf`,
  },
  // 2025-Q1-programs-brief.pdf (2 orphans)
  {
    shortId: "55f66310",
    fullUuid: "55f66310-fd89-4106-8d80-aee02c823a02",
    fileName: "2025-Q1-programs-brief.pdf",
    storagePath: `${ORG_UUID}/55f66310-fd89-4106-8d80-aee02c823a02/2025-Q1-programs-brief.pdf`,
  },
  {
    shortId: "4d0012be",
    fullUuid: "4d0012be-914c-426a-916f-c6852088e1bc",
    fileName: "2025-Q1-programs-brief.pdf",
    storagePath: `${ORG_UUID}/4d0012be-914c-426a-916f-c6852088e1bc/2025-Q1-programs-brief.pdf`,
  },
  // DDCF-2024-grant-application-DECLINED.pdf (2 orphans)
  {
    shortId: "907632bd",
    fullUuid: "907632bd-eb84-4e18-a519-6a4b692bea18",
    fileName: "DDCF-2024-grant-application-DECLINED.pdf",
    storagePath: `${ORG_UUID}/907632bd-eb84-4e18-a519-6a4b692bea18/DDCF-2024-grant-application-DECLINED.pdf`,
  },
  {
    shortId: "e77dbc2d",
    fullUuid: "e77dbc2d-74ee-44c1-8f73-cd9716bc4837",
    fileName: "DDCF-2024-grant-application-DECLINED.pdf",
    storagePath: `${ORG_UUID}/e77dbc2d-74ee-44c1-8f73-cd9716bc4837/DDCF-2024-grant-application-DECLINED.pdf`,
  },
  // MEAF-2024-grant-application-FUNDED.pdf (2 orphans — dedup candidates; all 3 were done)
  {
    shortId: "7d20eda6",
    fullUuid: "7d20eda6-a4fa-40e8-8abd-94667c581bd7",
    fileName: "MEAF-2024-grant-application-FUNDED.pdf",
    storagePath: `${ORG_UUID}/7d20eda6-a4fa-40e8-8abd-94667c581bd7/MEAF-2024-grant-application-FUNDED.pdf`,
  },
  {
    shortId: "06afd9ba",
    fullUuid: "06afd9ba-10f2-4c68-8a40-4660ade481bb",
    fileName: "MEAF-2024-grant-application-FUNDED.pdf",
    storagePath: `${ORG_UUID}/06afd9ba-10f2-4c68-8a40-4660ade481bb/MEAF-2024-grant-application-FUNDED.pdf`,
  },
  // MEAF-Q4-2024-funder-report.pdf (2 orphans)
  {
    shortId: "b34d4fff",
    fullUuid: "b34d4fff-b92c-4426-bb52-b90670582e08",
    fileName: "MEAF-Q4-2024-funder-report.pdf",
    storagePath: `${ORG_UUID}/b34d4fff-b92c-4426-bb52-b90670582e08/MEAF-Q4-2024-funder-report.pdf`,
  },
  {
    shortId: "f2d52be8",
    fullUuid: "f2d52be8-ac0c-4f77-a1cc-d024e8f2b916",
    fileName: "MEAF-Q4-2024-funder-report.pdf",
    storagePath: `${ORG_UUID}/f2d52be8-ac0c-4f77-a1cc-d024e8f2b916/MEAF-Q4-2024-funder-report.pdf`,
  },
  // mission-about-and-campaign-copy.pdf (2 orphans)
  {
    shortId: "750a907d",
    fullUuid: "750a907d-6fa6-4706-abf5-08b1ef5157d8",
    fileName: "mission-about-and-campaign-copy.pdf",
    storagePath: `${ORG_UUID}/750a907d-6fa6-4706-abf5-08b1ef5157d8/mission-about-and-campaign-copy.pdf`,
  },
  {
    shortId: "97f2b370",
    fullUuid: "97f2b370-ec3b-4b0f-8ee5-75fb5fe9d5d9",
    fileName: "mission-about-and-campaign-copy.pdf",
    storagePath: `${ORG_UUID}/97f2b370-ec3b-4b0f-8ee5-75fb5fe9d5d9/mission-about-and-campaign-copy.pdf`,
  },
  // spring-2025-newsletter.pdf (2 orphans — 1 was failed+cron-retrying, 1 was stale-done)
  {
    shortId: "c6e4871e",
    fullUuid: "c6e4871e-c722-4950-a109-bd9df41eaa07",
    fileName: "spring-2025-newsletter.pdf",
    storagePath: `${ORG_UUID}/c6e4871e-c722-4950-a109-bd9df41eaa07/spring-2025-newsletter.pdf`,
  },
  {
    shortId: "b82086f1",
    fullUuid: "b82086f1-7abc-4a8f-95cd-86aacc65d00a",
    fileName: "spring-2025-newsletter.pdf",
    storagePath: `${ORG_UUID}/b82086f1-7abc-4a8f-95cd-86aacc65d00a/spring-2025-newsletter.pdf`,
  },
  // workforce-prep-pilot-outcomes-memo.pdf (2 orphans)
  {
    shortId: "b129dfb6",
    fullUuid: "b129dfb6-866a-4561-a093-1c58741bbe96",
    fileName: "workforce-prep-pilot-outcomes-memo.pdf",
    storagePath: `${ORG_UUID}/b129dfb6-866a-4561-a093-1c58741bbe96/workforce-prep-pilot-outcomes-memo.pdf`,
  },
  {
    shortId: "3021fa4e",
    fullUuid: "3021fa4e-a12b-4030-b860-3142360486b8",
    fileName: "workforce-prep-pilot-outcomes-memo.pdf",
    storagePath: `${ORG_UUID}/3021fa4e-a12b-4030-b860-3142360486b8/workforce-prep-pilot-outcomes-memo.pdf`,
  },
];

// ---------------------------------------------------------------------------
// Keeper doc_uuid directories — sanity check (must NOT disappear)
// 8 rows kept by PR #18's DB cleanup; their Storage objects are canonical.
// ---------------------------------------------------------------------------

const KEEPER_ENTRIES: Array<{ shortId: string; fullUuid: string; fileName: string }> = [
  { shortId: "9c564dd6", fullUuid: "9c564dd6-d315-4c15-9835-28ecd56061bd", fileName: "2024-impact-report-board-edition.pdf" },
  { shortId: "e1f324e6", fullUuid: "e1f324e6-f765-4eb6-b974-7b158b65e1db", fileName: "2025-Q1-programs-brief.pdf" },
  { shortId: "2e220d0e", fullUuid: "2e220d0e-6e0f-4e4e-88a7-192607242410", fileName: "DDCF-2024-grant-application-DECLINED.pdf" },
  { shortId: "d1dd3282", fullUuid: "d1dd3282-4a31-4273-baea-ec531a0b55b4", fileName: "MEAF-2024-grant-application-FUNDED.pdf" },
  { shortId: "267a5356", fullUuid: "267a5356-a57e-4486-8fa8-42aa6a1b228f", fileName: "MEAF-Q4-2024-funder-report.pdf" },
  { shortId: "5d5c00ac", fullUuid: "5d5c00ac-ed0d-4ad7-bf49-f3603bcd29e3", fileName: "mission-about-and-campaign-copy.pdf" },
  { shortId: "fb9b34e0", fullUuid: "fb9b34e0-2850-4967-bc6a-9edb4f656d29", fileName: "spring-2025-newsletter.pdf" },
  { shortId: "1dcf96d9", fullUuid: "1dcf96d9-5572-4a88-be30-47ecebe64c07", fileName: "workforce-prep-pilot-outcomes-memo.pdf" },
];

const ORG_DOCUMENTS_BUCKET = "org-documents";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Storage Orphan-PDF Cleanup Script ===");
  console.log("PR #18 follow-up — PENDING CITLALI-IN-LOOP AUTHORIZATION");
  console.log(`Mode:       ${DRY_RUN ? "DRY RUN (no deletes)" : "LIVE DELETE"}`);
  console.log(`Auth flag:  ${CONFIRM_CITLALI_AUTH ? "passed" : "NOT PASSED (dry-run only)"}`);
  console.log(`Org ID:     ${ORG_ID_FLAG}`);
  console.log(`Target:     ${ORPHAN_ENTRIES.length} Storage objects in bucket "${ORG_DOCUMENTS_BUCKET}"`);
  console.log();

  // 1. Load env
  const env = loadEnv();
  const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
    process.exit(1);
  }

  // 2. Supabase service client
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Pre-flight: list bucket directory and verify presence
  console.log("--- PRE-FLIGHT ---");
  console.log(`Listing bucket prefix: ${ORG_UUID}/`);

  const { data: listing, error: listError } = await client.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .list(ORG_UUID, { limit: 200 });

  if (listError) {
    console.error(`FATAL: Storage list failed: ${listError.message}`);
    process.exit(1);
  }

  const listedNames = new Set((listing ?? []).map((item) => item.name));
  console.log(`Found ${listedNames.size} doc_uuid directories under org prefix.`);

  // Check orphan directories
  const missingOrphans: string[] = [];
  const foundOrphans: string[] = [];

  console.log("\nOrphan directory presence check:");
  for (const entry of ORPHAN_ENTRIES) {
    const present = listedNames.has(entry.fullUuid);
    const status = present ? "PRESENT" : "MISSING (may have been cleaned already)";
    console.log(`  [${entry.shortId}] ${entry.fileName.padEnd(50)} ${status}`);
    if (present) {
      foundOrphans.push(entry.fullUuid);
    } else {
      missingOrphans.push(entry.shortId);
    }
  }

  if (missingOrphans.length > 0) {
    console.log(
      `\n[ANOMALY] ${missingOrphans.length} orphan(s) already absent from Storage — may have been cleaned up separately.`
    );
    console.log(`  Short IDs: ${missingOrphans.join(", ")}`);
    console.log("  Proceeding with remaining orphans only (not a blocker).\n");
  }

  // Check keeper directories — STOP if any keeper is missing
  const missingKeepers: string[] = [];
  console.log("\nKeeper directory sanity check:");
  for (const keeper of KEEPER_ENTRIES) {
    const present = listedNames.has(keeper.fullUuid);
    const status = present ? "OK" : "MISSING — INCONSISTENCY DETECTED";
    console.log(`  [${keeper.shortId}] ${keeper.fileName.padEnd(50)} ${status}`);
    if (!present) {
      missingKeepers.push(keeper.shortId);
    }
  }

  if (missingKeepers.length > 0) {
    console.error(
      `\nFATAL: ${missingKeepers.length} keeper(s) are MISSING from Storage.` +
      "\nThis indicates the bucket state is inconsistent with the DB." +
      "\nDO NOT proceed. Escalate to Lopmon for diagnosis before any cleanup." +
      `\nMissing keeper short IDs: ${missingKeepers.join(", ")}`
    );
    process.exit(1);
  }

  console.log("\nAll keepers confirmed present. Safe to proceed.");

  // 4. Dry-run: print paths and exit
  const pathsToDelete = ORPHAN_ENTRIES
    .filter((e) => listedNames.has(e.fullUuid))
    .map((e) => e.storagePath);

  console.log(`\n${DRY_RUN ? "[DRY RUN]" : "[LIVE]"} Storage objects to delete (${pathsToDelete.length}):`);
  for (const p of pathsToDelete) {
    console.log(`  DELETE ${p}`);
  }

  if (DRY_RUN) {
    console.log(
      "\nDry run complete. No objects were deleted." +
      "\nReview the list above, then run with --confirm-citlali-auth (after Citlali authorizes) to execute."
    );
    return;
  }

  // 5. Execute delete
  console.log(`\n--- EXECUTING DELETE (${pathsToDelete.length} objects) ---`);

  if (pathsToDelete.length === 0) {
    console.log("Nothing to delete — all orphan objects already absent. Exiting cleanly.");
    return;
  }

  const { data: removeData, error: removeError } = await client.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .remove(pathsToDelete);

  if (removeError) {
    console.error(`FATAL: Storage remove failed: ${removeError.message}`);
    console.error("No further action taken. Escalate to Lopmon.");
    process.exit(1);
  }

  const removedCount = removeData?.length ?? 0;
  console.log(`Storage remove API returned ${removedCount} removed object(s).`);

  if (removedCount > 0) {
    console.log("Removed objects:");
    for (const obj of removeData ?? []) {
      console.log(`  OK  ${(obj as { name?: string }).name ?? "(unknown)"}`);
    }
  }

  // 6. Post-flight: re-list bucket to confirm count dropped
  console.log("\n--- POST-FLIGHT ---");
  const { data: postListing, error: postListError } = await client.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .list(ORG_UUID, { limit: 200 });

  if (postListError) {
    console.warn(`WARN: Post-flight list failed: ${postListError.message}`);
    console.warn("Cannot confirm final count — verify manually in Supabase dashboard.");
  } else {
    const postCount = (postListing ?? []).length;
    const delta = listedNames.size - postCount;
    console.log(`Pre-flight directory count:  ${listedNames.size}`);
    console.log(`Post-flight directory count: ${postCount}`);
    console.log(`Delta:                       ${delta} (expected: ${pathsToDelete.length})`);

    if (delta === pathsToDelete.length) {
      console.log("POST-FLIGHT PASS: directory count reduced by expected amount.");
    } else {
      console.warn(
        `POST-FLIGHT MISMATCH: expected delta of ${pathsToDelete.length}, got ${delta}.` +
        "\nVerify manually in Supabase Storage dashboard."
      );
    }
  }

  // 7. Structured log output
  console.log("\n--- STRUCTURED LOG (paste into SESSION-LOG) ---");
  console.log(`Storage cleanup executed: ${new Date().toISOString()}`);
  console.log(`Org ID: ${ORG_ID_FLAG}`);
  console.log(`Objects targeted: ${pathsToDelete.length}`);
  console.log(`Objects removed (API): ${removedCount}`);
  console.log(`Pre-flight dir count: ${listedNames.size}`);
  const postListingFinal = await client.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .list(ORG_UUID, { limit: 200 });
  const finalCount = (postListingFinal.data ?? []).length;
  console.log(`Post-flight dir count: ${finalCount}`);
  console.log(`Anomalies: ${missingOrphans.length > 0 ? `${missingOrphans.length} orphan(s) already absent (${missingOrphans.join(", ")})` : "none"}`);
  console.log("--- END LOG ---\n");

  console.log("=== DONE ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
