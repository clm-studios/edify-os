#!/usr/bin/env npx tsx
/**
 * seed-proof-library-clm.ts
 *
 * One-shot seed script that generates 8 demo PDFs for the CLM Studios org
 * persona and uploads them to the Edify org's proof library.
 *
 * Steps:
 *   1. Generate 8 PDFs in-memory using pdfkit.
 *   2. Insert documents rows + upload PDFs to Supabase Storage bucket
 *      "org-documents" under the Edify org prefix.
 *   3. POST to /api/proof-library/extract-pending to trigger extraction.
 *   4. Poll until all docs reach done/failed or 3-minute cap.
 *   5. Print a final summary report.
 *
 * Flags:
 *   --dry-run      Render PDFs to tmp/seed-output/ without uploading.
 *   --skip-extract Upload and insert, but don't trigger extraction.
 *   --force        Re-upload even if docs with the same filename already exist.
 *   --help         Show usage and exit.
 *
 * Environment (read from apps/web/.env.local relative to repo root):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";
import { ALL_DOCS, type DocContent, type DocSection } from "./seed-proof-library-clm-content";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_EXTRACT = args.includes("--skip-extract");
const FORCE = args.includes("--force");
const SHOW_HELP = args.includes("--help") || args.includes("-h");

if (SHOW_HELP) {
  console.log(`
seed-proof-library-clm — Generate + upload 8 CLM Studios demo PDFs to the Edify proof library

Usage:
  pnpm --filter web seed-proof-library-clm [flags]

Flags:
  --dry-run      Render PDFs to tmp/seed-output/; do NOT upload or insert.
  --skip-extract Upload + insert, but skip extraction trigger.
  --force        Re-upload even if docs with the same filename already exist.
  --help         Show this message.

Requires apps/web/.env.local with:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
// Fallback: main repo .env.local.
// Worktree path: edify-os/.claude/worktrees/<name>/
// REPO_ROOT = worktree root = edify-os/.claude/worktrees/<name>
// Main repo root = edify-os/ = REPO_ROOT/../../../  (3 levels up)
const MAIN_REPO_ROOT = path.resolve(REPO_ROOT, "..", "..", "..");
const ENV_PATH_MAIN = path.join(MAIN_REPO_ROOT, "apps", "web", ".env.local");

const EXTRACT_ENDPOINT = "https://edify-os.vercel.app/api/proof-library/extract-pending";
const ORG_DOCUMENTS_BUCKET = "org-documents";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ---------------------------------------------------------------------------
// Env loading (no external dotenv dep — manual parse)
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  let envPath = ENV_PATH;
  if (!fs.existsSync(envPath)) {
    envPath = ENV_PATH_MAIN;
  }
  if (!fs.existsSync(envPath)) {
    console.error(`Error: .env.local not found at ${ENV_PATH} or ${ENV_PATH_MAIN}`);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes (single or double)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

/**
 * Generate a PDF buffer from a DocContent specification.
 * Uses pdfkit with Helvetica (built-in, no font file needed).
 */
async function generatePdf(doc: DocContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // bufferPages: true enables switchToPage for footer injection
    const pdf = new PDFDocument({
      size: "LETTER",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
      info: {
        Title: doc.title,
        Author: "CLM Studios",
        Subject: "Proof Library Demo Document",
      },
    });

    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    // Header — organization name
    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#666666")
      .text("CLM Studios", { align: "right" });

    pdf.moveDown(0.3);
    pdf.moveTo(72, pdf.y).lineTo(pdf.page.width - 72, pdf.y).stroke("#cccccc");
    pdf.moveDown(0.5);

    // Document title
    pdf
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111111")
      .text(doc.title, { align: "left" });

    pdf.moveDown(0.5);
    pdf.moveTo(72, pdf.y).lineTo(pdf.page.width - 72, pdf.y).stroke("#333333");
    pdf.moveDown(1);

    // Sections
    for (const section of doc.sections) {
      if (section.heading) {
        pdf
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor("#222222")
          .text(section.heading);
        pdf.moveDown(0.4);
      }

      if (section.body) {
        pdf
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#333333")
          .text(section.body, {
            lineGap: 3,
            paragraphGap: 4,
          });
        pdf.moveDown(0.4);
      }

      if (section.bullet && section.bullet.length > 0) {
        for (const item of section.bullet) {
          pdf
            .font("Helvetica")
            .fontSize(11)
            .fillColor("#333333")
            .text(`• ${item}`, {
              indent: 16,
              lineGap: 3,
            });
        }
        pdf.moveDown(0.5);
      }

      if (section.heading) {
        pdf.moveDown(0.6);
      }
    }

    // Footer — page numbers (requires bufferPages: true)
    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      pdf.switchToPage(range.start + i);
      pdf
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#999999")
        .text(
          `CLM Studios  |  ${doc.title}  |  Page ${i + 1} of ${range.count}`,
          72,
          pdf.page.height - 50,
          { align: "center", width: pdf.page.width - 144 }
        );
    }

    pdf.flushPages();
    pdf.end();
  });
}

// ---------------------------------------------------------------------------
// HTTP helper (avoids fetch for Node compat)
// ---------------------------------------------------------------------------

interface HttpResponse {
  status: number;
  body: string;
}

function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const bodyBuffer = Buffer.from(body, "utf-8");
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": bodyBuffer.length,
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });

    req.on("error", reject);
    req.write(bodyBuffer);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = ReturnType<typeof createClient<any>>;

/** Resolve the Edify org ID from the orgs table. */
async function resolveEdifyOrgId(client: SupabaseAny): Promise<string> {
  // Strategy 1: look up by member email
  const { data: memberRows } = await (client as SupabaseAny)
    .rpc("get_user_id_by_email_service", { email: "edifysaas@gmail.com" })
    .maybeSingle();

  // Strategy 2: look up orgs by name containing "edify" — we know the org exists
  const { data: orgRows, error } = await client
    .from("orgs")
    .select("id, name")
    .ilike("name", "%edify%")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("Error querying orgs:", error);
    throw new Error(`Failed to query orgs: ${error.message}`);
  }

  if (!orgRows || orgRows.length === 0) {
    throw new Error(
      'No org found matching "%edify%". Cannot proceed without a verified org ID. ' +
      'Run: SELECT id, name FROM orgs WHERE name ILIKE \'%edify%\';'
    );
  }

  // Use the known org from SESSION-LOG (e07d3c8d-...) — verify it's in results
  // The known prefix from SESSION-LOG entries is e07d3c8d
  const knownPrefix = "e07d3c8d";
  const knownOrg = orgRows.find((r: { id: string; name: string }) => r.id.startsWith(knownPrefix));
  if (knownOrg) {
    console.log(`[org] Resolved Edify org: id=${knownOrg.id} name="${knownOrg.name}"`);
    return knownOrg.id;
  }

  // Fallback: use first result but warn
  const first = orgRows[0];
  console.warn(
    `[org] WARN: Known org prefix ${knownPrefix} not found. Using first match: id=${first.id} name="${first.name}". Verify before proceeding.`
  );
  return first.id;
}

/** Look up the owner member_id for an org (for uploaded_by). */
async function resolveOwnerMemberId(
  client: SupabaseAny,
  orgId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("members")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`[members] Could not resolve owner member_id: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

/** Check if a document with the given filename already exists for the org. */
async function docAlreadyExists(
  client: SupabaseAny,
  orgId: string,
  fileName: string
): Promise<string | null> {
  const { data } = await client
    .from("documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("file_name", fileName)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface UploadResult {
  doc: DocContent;
  docId: string | null;
  status: "uploaded" | "skipped" | "failed";
  error?: string;
  storagePath?: string;
}

interface ExtractionStatus {
  docId: string;
  fileName: string;
  processingStatus: string;
  memoryEntryCount: number;
}

async function main() {
  console.log("\n=== CLM Studios Proof Library Seed Script ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : SKIP_EXTRACT ? "upload-only (--skip-extract)" : "full (upload + extract)"}`);
  console.log(`Force re-upload: ${FORCE}`);
  console.log();

  // 1. Load env
  const env = loadEnv();
  const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  const cronSecret = env["CRON_SECRET"];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }
  if (!cronSecret && !DRY_RUN && !SKIP_EXTRACT) {
    console.error("Error: CRON_SECRET must be set in .env.local for extraction trigger");
    process.exit(1);
  }

  // 2. Set up Supabase service client
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Generate PDFs
  console.log(`Generating ${ALL_DOCS.length} PDFs...`);
  const pdfBuffers: Map<string, Buffer> = new Map();

  for (const doc of ALL_DOCS) {
    process.stdout.write(`  Generating ${doc.filename}...`);
    const buffer = await generatePdf(doc);
    pdfBuffers.set(doc.filename, buffer);
    console.log(` ${(buffer.length / 1024).toFixed(1)} KB`);
  }
  console.log();

  // 4. Dry run — write to disk and exit
  if (DRY_RUN) {
    const outputDir = path.join(REPO_ROOT, "tmp", "seed-output");
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Writing PDFs to ${outputDir}/`);
    for (const [filename, buffer] of pdfBuffers) {
      const outPath = path.join(outputDir, filename);
      fs.writeFileSync(outPath, buffer);
      console.log(`  Wrote ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    }
    console.log("\nDry run complete. Review PDFs, then run without --dry-run.");
    return;
  }

  // 5. Resolve org
  console.log("Resolving Edify org ID...");
  let orgId: string;
  try {
    orgId = await resolveEdifyOrgId(client);
  } catch (err) {
    console.error("FATAL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log("Resolving owner member ID...");
  const ownerMemberId = await resolveOwnerMemberId(client, orgId);
  if (ownerMemberId) {
    console.log(`  Owner member_id: ${ownerMemberId}`);
  } else {
    console.warn("  No owner member found — uploaded_by will be NULL");
  }
  console.log();

  // 6. Upload docs
  console.log("Uploading documents...");
  const uploadResults: UploadResult[] = [];

  for (const doc of ALL_DOCS) {
    const buffer = pdfBuffers.get(doc.filename)!;
    process.stdout.write(`  ${doc.filename}...`);

    // Check for existing doc (unless --force)
    if (!FORCE) {
      const existingId = await docAlreadyExists(client, orgId, doc.filename);
      if (existingId) {
        console.log(` SKIP (already exists, id=${existingId})`);
        uploadResults.push({
          doc,
          docId: existingId,
          status: "skipped",
        });
        continue;
      }
    }

    // Insert documents row (storage_path = null initially, per upload route pattern)
    const { data: docRow, error: insertError } = await client
      .from("documents")
      .insert({
        org_id: orgId,
        uploaded_by: ownerMemberId ?? null,
        file_name: doc.filename,
        file_size_bytes: buffer.length,
        mime_type: "application/pdf",
        category: doc.category,
        processing_status: "pending",
        storage_path: null,
      })
      .select("id")
      .single();

    if (insertError || !docRow) {
      console.log(` FAILED (insert: ${insertError?.message})`);
      uploadResults.push({ doc, docId: null, status: "failed", error: insertError?.message });
      continue;
    }

    const docId: string = docRow.id;
    const storagePath = `${orgId}/${docId}/${doc.filename}`;

    // Upload buffer to Storage
    const { error: storageError } = await client.storage
      .from(ORG_DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: FORCE,
      });

    if (storageError) {
      // Clean up orphaned documents row
      await client.from("documents").delete().eq("id", docId);
      console.log(` FAILED (storage: ${storageError.message})`);
      uploadResults.push({
        doc,
        docId: null,
        status: "failed",
        error: `Storage upload failed: ${storageError.message}`,
      });
      continue;
    }

    // Update storage_path on documents row
    const { error: updateError } = await client
      .from("documents")
      .update({ storage_path: storagePath })
      .eq("id", docId);

    if (updateError) {
      console.warn(` WARN: storage_path update failed: ${updateError.message}`);
    }

    console.log(` OK (id=${docId}, ${(buffer.length / 1024).toFixed(1)} KB)`);
    uploadResults.push({ doc, docId, status: "uploaded", storagePath });
  }

  const successfulUploads = uploadResults.filter((r) => r.status === "uploaded" || r.status === "skipped");
  const failedUploads = uploadResults.filter((r) => r.status === "failed");

  console.log(
    `\nUpload summary: ${uploadResults.filter((r) => r.status === "uploaded").length} uploaded, ` +
    `${uploadResults.filter((r) => r.status === "skipped").length} skipped, ` +
    `${failedUploads.length} failed.`
  );

  if (failedUploads.length > 0) {
    for (const r of failedUploads) {
      console.error(`  FAILED: ${r.doc.filename} — ${r.error}`);
    }
  }

  if (SKIP_EXTRACT) {
    console.log("\n--skip-extract: stopping before extraction trigger.");
    printDocIds(uploadResults);
    return;
  }

  if (successfulUploads.length === 0) {
    console.error("\nNo docs uploaded successfully — cannot trigger extraction.");
    process.exit(1);
  }

  // 7. Trigger extraction
  console.log("\nTriggering extraction endpoint...");
  let extractionTriggered = false;
  try {
    const resp = await httpPost(
      EXTRACT_ENDPOINT,
      JSON.stringify({ orgId }),
      {
        Authorization: `Bearer ${cronSecret}`,
      }
    );
    if (resp.status >= 200 && resp.status < 300) {
      console.log(`  Extraction triggered (HTTP ${resp.status}): ${resp.body.slice(0, 200)}`);
      extractionTriggered = true;
    } else {
      console.error(`  Extraction trigger failed (HTTP ${resp.status}): ${resp.body.slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`  Extraction trigger error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!extractionTriggered) {
    console.warn("  Extraction was not triggered — skipping poll. Run with --skip-extract to stop here cleanly.");
    printDocIds(uploadResults);
    return;
  }

  // 8. Poll for completion
  console.log(`\nPolling for extraction completion (cap: ${POLL_TIMEOUT_MS / 1000}s)...`);
  const targetDocIds = successfulUploads
    .map((r) => r.docId)
    .filter((id): id is string => id !== null);

  const startTime = Date.now();
  let lastStatuses: ExtractionStatus[] = [];

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const { data: docRows, error: pollError } = await client
      .from("documents")
      .select("id, file_name, processing_status")
      .in("id", targetDocIds);

    if (pollError) {
      console.error(`  Poll error: ${pollError.message}`);
      continue;
    }

    if (!docRows) continue;

    // Count memory_entries per doc
    const statuses: ExtractionStatus[] = [];
    for (const row of docRows) {
      const { count } = await client
        .from("memory_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .like("source", `document:${row.id}`);

      statuses.push({
        docId: row.id,
        fileName: row.file_name,
        processingStatus: row.processing_status,
        memoryEntryCount: count ?? 0,
      });
    }

    lastStatuses = statuses;

    const pending = statuses.filter((s) => s.processingStatus === "pending" || s.processingStatus === "processing");
    const done = statuses.filter((s) => s.processingStatus === "done");
    const failed = statuses.filter((s) => s.processingStatus === "failed");

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(
      `\r  [${elapsed}s] done=${done.length} failed=${failed.length} pending=${pending.length}   `
    );

    if (pending.length === 0) {
      console.log(); // newline after carriage-return progress
      break;
    }
  }

  if (Date.now() - startTime >= POLL_TIMEOUT_MS) {
    console.log(`\n  Poll timeout reached (${POLL_TIMEOUT_MS / 1000}s). Some docs may still be processing.`);
  }

  // 9. Final report
  console.log("\n=== FINAL REPORT ===\n");

  // Per-doc status
  console.log("Per-document status:");
  for (const status of lastStatuses) {
    const uploadResult = uploadResults.find((r) => r.docId === status.docId);
    const icon = status.processingStatus === "done" ? "✓" : status.processingStatus === "failed" ? "✗" : "?";
    console.log(
      `  ${icon} ${status.fileName.padEnd(50)} ${status.processingStatus.padEnd(12)} entries=${status.memoryEntryCount}`
    );
    if (uploadResult?.status === "skipped") {
      console.log(`    (was already in DB — re-used existing doc ID)`);
    }
  }

  // Docs not tracked in poll (failed uploads that never made it to DB)
  for (const r of failedUploads) {
    console.log(`  ✗ ${r.doc.filename.padEnd(50)} UPLOAD_FAILED`);
  }

  // Memory entries breakdown by category
  console.log("\nMemory entries by proof-library category:");
  for (const cat of ["prior_grants", "outcomes", "voice_samples"]) {
    const { count } = await client
      .from("memory_entries")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("category", cat);
    console.log(`  ${cat.padEnd(20)} ${count ?? 0}`);
  }

  // Total
  const totalMemoryEntries = lastStatuses.reduce((sum, s) => sum + s.memoryEntryCount, 0);
  console.log(`\n  Total memory_entries created: ${totalMemoryEntries}`);

  // Target check
  const TARGET = 10;
  if (totalMemoryEntries >= TARGET) {
    console.log(`  ✓ Target met: ≥${TARGET} memory entries created.`);
  } else {
    console.warn(
      `  ⚠ Target NOT met: ${totalMemoryEntries} entries < target of ${TARGET}. ` +
      "Consider re-running with --force to re-trigger extraction."
    );
  }

  // Extraction errors
  const failedExtractions = lastStatuses.filter((s) => s.processingStatus === "failed");
  if (failedExtractions.length > 0) {
    console.log(`\nFailed extractions (${failedExtractions.length}):`);
    for (const s of failedExtractions) {
      console.log(`  - ${s.fileName}`);
    }
    console.log(
      "  To inspect: SELECT file_name, parsed_text FROM documents WHERE processing_status = 'failed' AND org_id = '" +
      orgId + "';"
    );
  }

  // Generate a signed URL for one sample PDF
  console.log("\nGenerating signed URL for sample PDF...");
  const sampleResult = uploadResults.find((r) => r.status === "uploaded" && r.storagePath);
  if (sampleResult?.storagePath) {
    const { data: signedUrlData } = await client.storage
      .from(ORG_DOCUMENTS_BUCKET)
      .createSignedUrl(sampleResult.storagePath, 300); // 5 min

    if (signedUrlData?.signedUrl) {
      console.log(`\nSample PDF (5 min signed URL):`);
      console.log(`  File: ${sampleResult.doc.filename}`);
      console.log(`  URL:  ${signedUrlData.signedUrl}`);
    } else {
      console.log("  Could not generate signed URL.");
    }
  } else {
    console.log("  No uploaded docs available for signed URL generation.");
  }

  // Spot-check SQL
  console.log("\nSpot-check SQL:");
  console.log(
    `  SELECT category, COUNT(*) FROM memory_entries WHERE org_id = '${orgId}' ` +
    `AND category IN ('prior_grants', 'outcomes', 'voice_samples') GROUP BY category;`
  );

  console.log("\n=== DONE ===\n");
}

function printDocIds(uploadResults: UploadResult[]) {
  console.log("\nDocument IDs:");
  for (const r of uploadResults) {
    if (r.docId) {
      console.log(`  ${r.doc.filename}: ${r.docId} (${r.status})`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
