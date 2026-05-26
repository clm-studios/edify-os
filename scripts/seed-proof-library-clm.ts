#!/usr/bin/env tsx
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
 *   3. Trigger extraction by POSTing to /api/proof-library/extract-pending
 *      (with CRON_SECRET if available) OR directly via Anthropic API if
 *      CRON_SECRET is not set/empty in .env.local.
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
 *   NEXT_PUBLIC_SUPABASE_URL  — required
 *   SUPABASE_SERVICE_ROLE_KEY — required
 *   ENCRYPTION_KEY             — required for direct extraction
 *   CRON_SECRET                — optional; if set, triggers via HTTP endpoint
 *                                (useful if running against staging/prod)
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { ALL_DOCS, type DocContent } from "./seed-proof-library-clm-content";

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
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
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

// Proof library categories supported by the extractor
const PROOF_LIBRARY_CATEGORIES = ["prior_grants", "outcomes", "voice_samples"] as const;
const EXTRACTION_ROUTING: Record<string, { memoryCategories: string[] }> = {
  grant_proposal:      { memoryCategories: ["prior_grants"] },
  program_description: { memoryCategories: ["outcomes"] },
  marketing_materials: { memoryCategories: ["voice_samples"] },
};

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
// AES-256-GCM decryption (inline — mirrors apps/web/src/lib/crypto.ts)
// ---------------------------------------------------------------------------

const ENC_PREFIX = "enc:v1:";
const AES_ALGORITHM = "aes-256-gcm";

function decryptIfEncrypted(value: string | null | undefined, encryptionKey: string): string | null {
  if (!value) return null;
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext
  const body = value.slice(ENC_PREFIX.length);
  const [ivB64, ctB64, tagB64] = body.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Malformed ciphertext");
  const key = Buffer.from(encryptionKey, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
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
    // bufferPages: true enables switchToPage for footer injection.
    // compress: false keeps content streams uncompressed so the Supabase
    // extraction pipeline (which uses BT/ET regex extraction without native
    // PDF libraries) can read the text layer. File size increases ~2-3x
    // but stays well within the 10MB upload limit.
    const pdf = new PDFDocument({
      size: "LETTER",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
      compress: false,
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
      'No org found matching "%edify%". Cannot proceed without a verified org ID.'
    );
  }

  // Use the known org from SESSION-LOG (e07d3c8d-...)
  const knownPrefix = "e07d3c8d";
  const knownOrg = orgRows.find((r: { id: string; name: string }) => r.id.startsWith(knownPrefix));
  if (knownOrg) {
    console.log(`[org] Resolved Edify org: id=${knownOrg.id} name="${knownOrg.name}"`);
    return knownOrg.id;
  }

  const first = orgRows[0];
  console.warn(
    `[org] WARN: Known org prefix ${knownPrefix} not found. Using first match: id=${first.id} name="${first.name}".`
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

/** Get and decrypt the org's Anthropic API key from the DB. */
async function resolveOrgAnthropicKey(
  client: SupabaseAny,
  orgId: string,
  encryptionKey: string
): Promise<string | null> {
  const { data: org } = await client
    .from("orgs")
    .select("anthropic_api_key_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.anthropic_api_key_encrypted) return null;

  try {
    return decryptIfEncrypted(org.anthropic_api_key_encrypted as string, encryptionKey);
  } catch (err) {
    console.error("[crypto] Failed to decrypt Anthropic key:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Direct extraction (mirrors extract.ts logic without @/ path aliases)
// ---------------------------------------------------------------------------

/**
 * Minimal PDF text extraction optimized for pdfkit-generated PDFs.
 * pdfkit uses hex-encoded text strings: [<hexbytes> offset ...] TJ
 * Also handles (string) Tj format for compatibility.
 */
function extractPdfTextFromBuffer(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const textParts: string[] = [];

  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];

    // Handle hex-encoded text: [<hexbytes> n <hexbytes> n ...] TJ
    // pdfkit wraps each glyph in hex; we decode and concatenate
    const hexTJRegex = /\[((?:\s*<[0-9A-Fa-f]+>\s*(?:-?\d+\s*)?)+)\]\s*TJ/g;
    let hexMatch;
    while ((hexMatch = hexTJRegex.exec(block)) !== null) {
      const parts = hexMatch[1];
      const hexes = parts.match(/<([0-9A-Fa-f]+)>/g);
      if (hexes) {
        const decoded = hexes.map((h) => {
          const hex = h.slice(1, -1);
          let text = "";
          // pdfkit encodes each character as 2 hex bytes representing
          // the ASCII/Latin-1 code point. Decode byte by byte.
          for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.slice(i, i + 2), 16);
            if (byte >= 0x20 && byte <= 0x7E) {
              text += String.fromCharCode(byte);
            }
            // Non-printable or high bytes → skip (font-specific encoding)
          }
          return text;
        }).join("");
        if (decoded.trim()) textParts.push(decoded);
      }
    }

    // Handle literal string: (text) Tj
    const strRegex = /\(([^)]*)\)\s*T[jJ]/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const raw = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")");
      if (raw.trim()) textParts.push(raw);
    }
  }

  if (textParts.length === 0) {
    return buffer
      .toString("utf-8")
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim()
      .substring(0, 50000);
  }

  return textParts.join(" ").replace(/\s{2,}/g, " ").trim().substring(0, 50000);
}

function buildExtractionPrompt(rawText: string, targetCategories: string[], fileName: string): string {
  const categoryInstructions = targetCategories.map((cat) => {
    switch (cat) {
      case "prior_grants":
        return `
## Extracting: prior_grants
Extract ALL grant awards, applications, and funder relationships mentioned in the document.
For each grant found, produce a JSON object:
{ "category": "prior_grants", "title": "<funder name> — <grant program> <year>", "content": "<2-4 sentence summary>", "data": { "funder_name": "...", "year": <int or null>, "amount_requested": <int or null>, "amount_awarded": <int or null>, "status": "<funded|declined|pending|partial|unknown>", "grant_program": "...", "notes": "..." } }`;
      case "outcomes":
        return `
## Extracting: outcomes
Extract ALL quantitative impact metrics and program outcomes.
For each metric, produce a JSON object:
{ "category": "outcomes", "title": "<metric name> — <program> <year>", "content": "<1-3 sentence description>", "data": { "year": <int or null>, "metric_name": "...", "value": <number or null>, "unit": "...", "program": "...", "source": "..." } }`;
      case "voice_samples":
        return `
## Extracting: voice_samples
Extract 2-5 representative text samples capturing the organization's communication voice.
For each sample:
{ "category": "voice_samples", "title": "<source/context>", "content": "<verbatim text, 1-5 sentences>", "data": { "source_type": "<newsletter|donor_letter|social_post|annual_report|grant_proposal|other>", "approximate_date": "<year or year-month or null>", "channel": "<channel if known>" } }`;
      default: return "";
    }
  }).filter(Boolean).join("\n\n");

  return `You are an expert nonprofit data analyst extracting structured information from an organizational document.

Document filename: ${fileName}
Document text:
---
${rawText.substring(0, 40000)}
---

${categoryInstructions}

## Instructions
1. Extract ONLY what is explicitly present in the document. Do not fabricate data.
2. Return your response as valid JSON: { "extractions": [ ...one object per found item... ] }
3. If no data found: { "extractions": [], "note": "reason" }
4. Quality over quantity.`;
}

interface MemoryEntryInsert {
  org_id: string;
  category: string;
  title: string;
  content: string;
  data: Record<string, unknown> | null;
  source: string;
  auto_generated: boolean;
  created_by: null;
}

async function extractSingleDocDirect(
  client: SupabaseAny,
  docId: string,
  orgId: string,
  fileName: string,
  category: string,
  storagePath: string,
  anthropic: Anthropic
): Promise<{ success: boolean; entriesWritten: number; error?: string }> {
  // 1. Get routing
  const routing = EXTRACTION_ROUTING[category];
  if (!routing || routing.memoryCategories.length === 0) {
    // No proof lib categories for this type — mark done
    await client.from("documents").update({ processing_status: "done" }).eq("id", docId);
    return { success: true, entriesWritten: 0 };
  }

  // 2. Download from Storage
  const { data: fileData, error: downloadError } = await client.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadError || !fileData) {
    const msg = `Storage download failed: ${downloadError?.message ?? "no data"}`;
    await client.from("documents").update({
      processing_status: "failed",
      retry_count: 1,
      parsed_text: msg,
    }).eq("id", docId);
    return { success: false, entriesWritten: 0, error: msg };
  }

  // 3. Extract text
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const rawText = extractPdfTextFromBuffer(buffer);

  if (!rawText || rawText.trim().length < 50) {
    // Minimal text — mark done with 0 entries
    await client.from("documents").update({
      processing_status: "done",
      parsed_text: rawText || "(no text extracted)",
    }).eq("id", docId);
    return { success: true, entriesWritten: 0 };
  }

  // 4. Call Claude
  const prompt = buildExtractionPrompt(rawText, routing.memoryCategories, fileName);
  let responseText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const firstContent = response.content[0];
    if (firstContent.type !== "text") {
      throw new Error("Claude returned non-text response");
    }
    responseText = firstContent.text;
  } catch (err) {
    const msg = `Claude API error: ${err instanceof Error ? err.message : String(err)}`;
    await client.from("documents").update({
      processing_status: "failed",
      retry_count: 1,
      parsed_text: msg,
    }).eq("id", docId);
    return { success: false, entriesWritten: 0, error: msg };
  }

  // 5. Parse response
  let parsed: { extractions: Array<{ category: string; title: string; content: string; data: Record<string, unknown> | null }> };
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await client.from("documents").update({ processing_status: "done", parsed_text: rawText.substring(0, 10000) }).eq("id", docId);
      return { success: true, entriesWritten: 0 };
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    const msg = "Failed to parse Claude extraction response";
    await client.from("documents").update({ processing_status: "failed", retry_count: 1, parsed_text: msg }).eq("id", docId);
    return { success: false, entriesWritten: 0, error: msg };
  }

  if (!Array.isArray(parsed.extractions) || parsed.extractions.length === 0) {
    await client.from("documents").update({ processing_status: "done", parsed_text: rawText.substring(0, 10000) }).eq("id", docId);
    return { success: true, entriesWritten: 0 };
  }

  // 6. Build memory_entries
  const entries: MemoryEntryInsert[] = parsed.extractions
    .filter((e) => (
      e.category && e.title?.trim() && e.content?.trim() &&
      (PROOF_LIBRARY_CATEGORIES as readonly string[]).includes(e.category)
    ))
    .map((e) => ({
      org_id: orgId,
      category: e.category,
      title: e.title.trim().substring(0, 500),
      content: e.content.trim(),
      data: e.data ?? null,
      source: `document:${docId}`,
      auto_generated: true,
      created_by: null,
    }));

  // 7. Insert memory_entries
  if (entries.length > 0) {
    const { error: memError } = await client.from("memory_entries").insert(entries);
    if (memError) {
      const msg = `Memory insert error: ${memError.message}`;
      await client.from("documents").update({ processing_status: "failed", retry_count: 1, parsed_text: msg }).eq("id", docId);
      return { success: false, entriesWritten: 0, error: msg };
    }
  }

  // 8. Mark done
  await client.from("documents").update({
    processing_status: "done",
    parsed_text: rawText.substring(0, 10000),
  }).eq("id", docId);

  return { success: true, entriesWritten: entries.length };
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
  category: string;
}

interface ExtractionStatus {
  docId: string;
  fileName: string;
  processingStatus: string;
  memoryEntryCount: number;
  extractError?: string;
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
  const encryptionKey = env["ENCRYPTION_KEY"];
  const cronSecret = env["CRON_SECRET"] || ""; // may be empty string

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
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
          category: doc.category,
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
      uploadResults.push({ doc, docId: null, status: "failed", error: insertError?.message, category: doc.category });
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
        category: doc.category,
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
    uploadResults.push({ doc, docId, status: "uploaded", storagePath, category: doc.category });
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

  // 7. Extract — try HTTP endpoint first, fall back to direct extraction
  const extractionStatuses: ExtractionStatus[] = [];

  // Attempt HTTP endpoint if CRON_SECRET is available
  let httpExtractionTriggered = false;
  if (cronSecret) {
    console.log("\nTriggering extraction via HTTP endpoint...");
    try {
      const resp = await httpPost(
        EXTRACT_ENDPOINT,
        JSON.stringify({ orgId }),
        { Authorization: `Bearer ${cronSecret}` }
      );
      if (resp.status >= 200 && resp.status < 300) {
        console.log(`  HTTP trigger OK (${resp.status}): ${resp.body.slice(0, 200)}`);
        httpExtractionTriggered = true;
      } else {
        console.warn(`  HTTP trigger returned ${resp.status} — falling back to direct extraction`);
      }
    } catch (err) {
      console.warn(`  HTTP trigger error: ${err instanceof Error ? err.message : String(err)} — falling back to direct extraction`);
    }
  }

  if (httpExtractionTriggered) {
    // 8a. Poll for HTTP-triggered extraction completion
    console.log(`\nPolling for extraction completion (cap: ${POLL_TIMEOUT_MS / 1000}s)...`);
    const targetDocIds = successfulUploads
      .map((r) => r.docId)
      .filter((id): id is string => id !== null);

    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      const { data: docRows } = await client
        .from("documents")
        .select("id, file_name, processing_status")
        .in("id", targetDocIds);

      if (!docRows) continue;

      extractionStatuses.length = 0;
      for (const row of docRows) {
        const { count } = await client
          .from("memory_entries")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .like("source", `document:${row.id}`);

        extractionStatuses.push({
          docId: row.id,
          fileName: row.file_name,
          processingStatus: row.processing_status,
          memoryEntryCount: count ?? 0,
        });
      }

      const pending = extractionStatuses.filter(
        (s) => s.processingStatus === "pending" || s.processingStatus === "processing"
      );
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(
        `\r  [${elapsed}s] done=${extractionStatuses.filter((s) => s.processingStatus === "done").length} failed=${extractionStatuses.filter((s) => s.processingStatus === "failed").length} pending=${pending.length}   `
      );

      if (pending.length === 0) {
        console.log();
        break;
      }
    }

    if (Date.now() - Date.now() >= POLL_TIMEOUT_MS) {
      console.log(`\n  Poll timeout reached. Some docs may still be processing.`);
    }
  } else {
    // 8b. Direct extraction — process each doc inline
    console.log("\nRunning direct extraction (no CRON_SECRET or HTTP trigger failed)...");

    if (!encryptionKey) {
      console.error("Error: ENCRYPTION_KEY must be set for direct extraction");
      console.log("Tip: run `pnpm --filter web seed-proof-library-clm -- --skip-extract` to stop here,");
      console.log("then wait for the 3h cron to extract, or add ENCRYPTION_KEY to .env.local.");
      process.exit(1);
    }

    // Get org's Anthropic key
    const anthropicApiKey = await resolveOrgAnthropicKey(client, orgId, encryptionKey);
    if (!anthropicApiKey) {
      console.error("Error: No Anthropic API key found for the Edify org. Cannot run direct extraction.");
      console.log("The docs are uploaded (processing_status=pending). The 3h cron will extract them.");
      process.exit(0);
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    for (const uploadResult of successfulUploads) {
      const { docId, storagePath, category } = uploadResult;
      if (!docId || !storagePath) {
        // skipped doc — check current status
        if (docId) {
          const { data: existingDoc } = await client
            .from("documents")
            .select("id, file_name, processing_status, storage_path")
            .eq("id", docId)
            .single();

          if (existingDoc?.processing_status === "done") {
            const { count } = await client
              .from("memory_entries")
              .select("id", { count: "exact", head: true })
              .eq("org_id", orgId)
              .like("source", `document:${docId}`);
            extractionStatuses.push({
              docId,
              fileName: existingDoc.file_name,
              processingStatus: "done",
              memoryEntryCount: count ?? 0,
            });
            console.log(`  ${existingDoc.file_name}: already done (${count ?? 0} entries)`);
            continue;
          } else if (existingDoc?.storage_path) {
            // Re-extract
            process.stdout.write(`  Extracting ${existingDoc.file_name}...`);
            const result = await extractSingleDocDirect(
              client, docId, orgId, existingDoc.file_name, category, existingDoc.storage_path, anthropic
            );
            const icon = result.success ? "OK" : "FAIL";
            console.log(` ${icon} (${result.entriesWritten} entries${result.error ? ": " + result.error : ""})`);
            extractionStatuses.push({
              docId,
              fileName: existingDoc.file_name,
              processingStatus: result.success ? "done" : "failed",
              memoryEntryCount: result.entriesWritten,
              extractError: result.error,
            });
            continue;
          }
        }
        continue;
      }

      process.stdout.write(`  Extracting ${uploadResult.doc.filename}...`);
      const result = await extractSingleDocDirect(
        client, docId, orgId, uploadResult.doc.filename, category, storagePath, anthropic
      );
      const icon = result.success ? "OK" : "FAIL";
      console.log(` ${icon} (${result.entriesWritten} entries${result.error ? ": " + result.error : ""})`);
      extractionStatuses.push({
        docId,
        fileName: uploadResult.doc.filename,
        processingStatus: result.success ? "done" : "failed",
        memoryEntryCount: result.entriesWritten,
        extractError: result.error,
      });
    }
  }

  // 9. Final report
  console.log("\n=== FINAL REPORT ===\n");

  console.log("Per-document status:");
  for (const status of extractionStatuses) {
    const icon = status.processingStatus === "done" ? "✓" : status.processingStatus === "failed" ? "✗" : "?";
    console.log(
      `  ${icon} ${status.fileName.padEnd(55)} ${status.processingStatus.padEnd(12)} entries=${status.memoryEntryCount}`
    );
    if (status.extractError) {
      console.log(`    Error: ${status.extractError}`);
    }
  }

  // Docs with upload failures
  for (const r of failedUploads) {
    console.log(`  ✗ ${r.doc.filename.padEnd(55)} UPLOAD_FAILED`);
  }

  // Memory entries by category
  console.log("\nMemory entries by proof-library category:");
  for (const cat of ["prior_grants", "outcomes", "voice_samples"]) {
    const { count } = await client
      .from("memory_entries")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("category", cat);
    console.log(`  ${cat.padEnd(20)} ${count ?? 0}`);
  }

  const totalMemoryEntries = extractionStatuses.reduce((sum, s) => sum + s.memoryEntryCount, 0);
  console.log(`\n  Total memory_entries created: ${totalMemoryEntries}`);

  const TARGET = 10;
  if (totalMemoryEntries >= TARGET) {
    console.log(`  ✓ Target met: ≥10 memory entries created.`);
  } else {
    console.warn(
      `  ⚠ Target NOT met: ${totalMemoryEntries} entries < target of ${TARGET}. ` +
      "Consider re-running with --force to re-trigger extraction."
    );
  }

  const failedExtractions = extractionStatuses.filter((s) => s.processingStatus === "failed");
  if (failedExtractions.length > 0) {
    console.log(`\nFailed extractions (${failedExtractions.length}):`);
    for (const s of failedExtractions) {
      console.log(`  - ${s.fileName}: ${s.extractError ?? "unknown error"}`);
    }
  }

  // Generate signed URL for sample PDF
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
    // Try any uploaded doc in extractionStatuses
    const anyDone = extractionStatuses.find((s) => s.processingStatus === "done");
    if (anyDone) {
      const { data: docRow } = await client
        .from("documents")
        .select("storage_path, file_name")
        .eq("id", anyDone.docId)
        .single();
      if (docRow?.storage_path) {
        const { data: signedUrlData } = await client.storage
          .from(ORG_DOCUMENTS_BUCKET)
          .createSignedUrl(docRow.storage_path, 300);
        if (signedUrlData?.signedUrl) {
          console.log(`\nSample PDF (5 min signed URL):`);
          console.log(`  File: ${docRow.file_name}`);
          console.log(`  URL:  ${signedUrlData.signedUrl}`);
        }
      }
    } else {
      console.log("  No uploaded docs available for signed URL generation.");
    }
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
