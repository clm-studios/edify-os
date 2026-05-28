/**
 * Proof Library — Core extraction module (Sprint A.5)
 *
 * Exports `extractPendingDocuments`, the reusable function shared by BOTH
 * trigger paths:
 *   1. Cron sweeper (/api/proof-library/extract-pending) — runs every 3h
 *   2. Wizard-completion immediate trigger (/api/onboarding/complete)
 *
 * Architecture: each document is routed to an archetype-specific extractor
 * based on its category. Extractors download the file from Supabase Storage,
 * extract raw text, send a structured extraction prompt to Claude, and write
 * typed memory_entries rows with JSONB data fields.
 *
 * Failure handling:
 *   - Document unreadable: set processing_status='failed', zero memory entries.
 *   - Claude finds nothing: set processing_status='done', zero memory entries.
 *   - Claude API error: leave status='pending', increment retry_count, set
 *     last_attempted_at. Sweeper retries on next cycle. Cap at 3 retries.
 *   - Retry cap exceeded: set processing_status='failed'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { decryptIfEncrypted, CRYPTO_LABEL_ANTHROPIC_KEY } from "@/lib/crypto";
import { MODEL_IDS } from "@/lib/chat/run-archetype-turn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionOptions {
  /** Max documents to process in a single call (wizard trigger uses a low cap). */
  maxDocs?: number;
  /** Soft timeout in milliseconds — stop picking up new docs after this. */
  timeoutMs?: number;
  /** If true, run extraction logic but do NOT write to DB. For testing. */
  dryRun?: boolean;
  /** If provided, only process documents for this specific org (wizard trigger). */
  orgId?: string;
}

export interface ExtractionResult {
  processed: number;
  failed: number;
  skipped: number;
}

/** Shape stored in documents table */
interface DocumentRow {
  id: string;
  org_id: string;
  file_name: string;
  mime_type: string | null;
  storage_path: string | null;
  category: string;
  retry_count: number;
  last_attempted_at: string | null;
}

/** Memory entry shape for insertion */
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

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Supabase Storage bucket for org documents. Created by migration 00038. */
export const ORG_DOCUMENTS_BUCKET = "org-documents";

/** Proof library memory categories supported in Sprint A.5. */
export const PROOF_LIBRARY_CATEGORIES = ["prior_grants", "outcomes", "voice_samples"] as const;
export type ProofLibraryCategoryKey = (typeof PROOF_LIBRARY_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Routing table: document category → target memory categories + archetype hint
// ---------------------------------------------------------------------------

const EXTRACTION_ROUTING: Record<string, { memoryCategories: string[]; archetypeHint: string }> = {
  grant_proposal:      { memoryCategories: ["prior_grants"], archetypeHint: "development_director" },
  financial_statement: { memoryCategories: ["outcomes"], archetypeHint: "programs_director" },
  program_description: { memoryCategories: ["outcomes"], archetypeHint: "programs_director" },
  marketing_materials: { memoryCategories: ["voice_samples"], archetypeHint: "marketing_director" },
  strategic_plan:      { memoryCategories: ["outcomes"], archetypeHint: "executive_assistant" },
  donor_list:          { memoryCategories: [], archetypeHint: "development_director" }, // no proof lib category yet
  staff_roster:        { memoryCategories: [], archetypeHint: "hr_volunteer_coordinator" },
  board_documents:     { memoryCategories: [], archetypeHint: "executive_assistant" },
  event_plan:          { memoryCategories: [], archetypeHint: "events_director" },
  other:               { memoryCategories: [], archetypeHint: "executive_assistant" },
};

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract raw text from a file buffer.
 * For PDFs: use a minimal regex-based text extraction (avoids native binary deps
 * that break Vercel Node runtime). For DOCX/TXT: read directly.
 *
 * NOTE: This is intentionally minimal. A proper PDF parser (pdf-parse, pdfjs)
 * requires native binaries incompatible with Vercel's Edge/Node serverless. For
 * Sprint A.5, we extract printable ASCII/UTF-8 text from the raw PDF bytes.
 * This works for text-layer PDFs; image-only scans will yield minimal text, which
 * the extractor will gracefully handle by writing zero memory entries.
 */
function extractTextFromBuffer(buffer: Buffer, mimeType: string | null, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  // Plain text or CSV — read directly
  if (
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    ext === "txt" ||
    ext === "csv"
  ) {
    return buffer.toString("utf-8");
  }

  // PDF — strip binary bytes, extract text-layer content
  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdfText(buffer);
  }

  // DOCX — unzip is complex without native deps; extract printable UTF-8 text
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return extractDocxText(buffer);
  }

  // DOC / XLS / XLSX — best-effort printable UTF-8
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, "\n");
}

/**
 * Minimal PDF text extraction without native binaries.
 * Finds text between BT/ET markers and extracts string literals.
 * Works for text-layer PDFs; image-only PDFs yield empty/minimal text.
 */
function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const textParts: string[] = [];

  // Extract text between BT (begin text) and ET (end text) PDF operators
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    // Extract string literals: (text) Tj or [(text)] TJ
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

  // Fallback: extract all printable text runs from the buffer
  if (textParts.length === 0) {
    const printable = buffer
      .toString("utf-8")
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
    return printable.substring(0, 50000); // cap at 50k chars
  }

  return textParts.join(" ").replace(/\s{2,}/g, " ").trim().substring(0, 50000);
}

/**
 * Minimal DOCX text extraction: DOCX is a ZIP of XML files.
 * Without a ZIP parser, we extract printable text from the binary blob.
 * This catches most word/XML text since DOCX XML is mostly ASCII.
 */
function extractDocxText(buffer: Buffer): string {
  // Extract text-like content from the DOCX XML without unzipping
  const content = buffer.toString("utf-8");
  // Strip XML tags, keeping text content
  const stripped = content
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{3,}/g, "\n")
    .trim();
  return stripped.substring(0, 50000);
}

// ---------------------------------------------------------------------------
// Per-category extraction prompts
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  rawText: string,
  targetCategories: string[],
  fileName: string
): string {
  const categoryInstructions = targetCategories.map((cat) => {
    switch (cat) {
      case "prior_grants":
        return `
## Extracting: prior_grants
Extract ALL grant awards, applications, and funder relationships mentioned in the document.
For each grant found, produce a JSON object with these fields:
{
  "category": "prior_grants",
  "title": "<funder name> — <grant program or purpose> <year>",
  "content": "<2-4 sentence summary including funder relationship, award amount, program focus, and any key details>",
  "data": {
    "funder_name": "<funder organization name>",
    "year": <4-digit year as integer, or null if unknown>,
    "amount_requested": <numeric amount in dollars, or null if not mentioned>,
    "amount_awarded": <numeric amount in dollars, or null if not mentioned>,
    "status": "<funded|declined|pending|partial|unknown>",
    "grant_program": "<name of grant program or purpose>",
    "notes": "<any notable details about the relationship or grant>"
  }
}`;

      case "outcomes":
        return `
## Extracting: outcomes
Extract ALL quantitative impact metrics, program outcomes, and measurable results mentioned.
For each metric found, produce a JSON object with these fields:
{
  "category": "outcomes",
  "title": "<metric name> — <program name> <year>",
  "content": "<1-3 sentence description of this outcome including context and significance>",
  "data": {
    "year": <4-digit year as integer, or null if unknown>,
    "metric_name": "<name of the metric, e.g. 'students served', 'GPA improvement rate'>",
    "value": <numeric value, or null if not clearly numeric>,
    "unit": "<unit of measurement, e.g. 'students', 'percent', 'hours', 'dollars'>",
    "program": "<program or initiative this outcome belongs to>",
    "source": "<document section or report this came from>"
  }
}`;

      case "voice_samples":
        return `
## Extracting: voice_samples
Extract 2-5 representative text samples that best capture the organization's communication voice and tone.
Choose samples that show how the org writes to donors, describes its mission, or communicates its impact.
For each sample, produce a JSON object with these fields:
{
  "category": "voice_samples",
  "title": "<brief description of this sample's source/context>",
  "content": "<the actual text sample — keep verbatim, 1-5 sentences>",
  "data": {
    "source_type": "<newsletter|donor_letter|social_post|annual_report|grant_proposal|board_update|other>",
    "approximate_date": "<year or year-month if available, else null>",
    "channel": "<publication channel if known>"
  }
}`;

      default:
        return "";
    }
  }).filter(Boolean).join("\n\n");

  return `You are an expert nonprofit data analyst extracting structured information from an organizational document.

Document filename: ${fileName}
Document text (may be truncated):
---
${rawText.substring(0, 40000)}
---

${categoryInstructions}

## Instructions
1. Extract ONLY what is explicitly present in the document. Do not infer or fabricate data.
2. If you find NO data matching a category, return an empty array for that category.
3. Return your response as a valid JSON object with this exact structure:
{
  "extractions": [
    ... one object per found item (mix of categories is fine) ...
  ]
}
4. If the document is completely unreadable or contains no relevant data, return:
{
  "extractions": [],
  "note": "reason why no data was extracted"
}
5. Quality over quantity: it is better to extract 1 accurate item than 5 guessed ones.`;
}

// ---------------------------------------------------------------------------
// Single-document extraction
// ---------------------------------------------------------------------------

interface SingleDocExtractionResult {
  success: boolean;
  entries: MemoryEntryInsert[];
  rawText: string;
  errorMessage?: string;
}

async function extractSingleDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  doc: DocumentRow,
  anthropic: Anthropic
): Promise<SingleDocExtractionResult> {
  // 1. Get routing config
  const routing = EXTRACTION_ROUTING[doc.category] ?? EXTRACTION_ROUTING.other;
  const targetCategories = routing.memoryCategories.filter((c) =>
    (PROOF_LIBRARY_CATEGORIES as readonly string[]).includes(c)
  );

  if (targetCategories.length === 0) {
    // No proof library categories for this doc type — mark done with no entries
    return { success: true, entries: [], rawText: "" };
  }

  // 2. Download file from Storage
  if (!doc.storage_path) {
    return {
      success: false,
      entries: [],
      rawText: "",
      errorMessage: "No storage_path on document — cannot download",
    };
  }

  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from(ORG_DOCUMENTS_BUCKET)
    .download(doc.storage_path);

  if (downloadError || !fileData) {
    return {
      success: false,
      entries: [],
      rawText: "",
      errorMessage: `Storage download failed: ${downloadError?.message ?? "no data"}`,
    };
  }

  // 3. Extract raw text from buffer
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  let rawText: string;
  try {
    rawText = extractTextFromBuffer(buffer, doc.mime_type, doc.file_name);
  } catch (err) {
    return {
      success: false,
      entries: [],
      rawText: "",
      errorMessage: `Text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!rawText || rawText.trim().length < 50) {
    // Likely an image-only PDF or corrupted file
    return {
      success: true, // Not a failure — doc was "read" but contained no parseable text
      entries: [],
      rawText: rawText ?? "",
    };
  }

  // 4. Call Claude for structured extraction
  const prompt = buildExtractionPrompt(rawText, targetCategories, doc.file_name);
  let responseText: string;
  try {
    const response = await anthropic.messages.create({
      model: MODEL_IDS.sonnet,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const firstContent = response.content[0];
    if (firstContent.type !== "text") {
      return {
        success: false,
        entries: [],
        rawText,
        errorMessage: "Claude returned non-text response",
      };
    }
    responseText = firstContent.text;
  } catch (err) {
    // Claude API error — this is a retriable failure
    throw err; // Let the caller handle retry logic
  }

  // 5. Parse Claude's JSON response
  let parsed: { extractions: Array<{
    category: string;
    title: string;
    content: string;
    data: Record<string, unknown> | null;
  }> };

  try {
    // Find JSON object in response (Claude sometimes adds prose around it)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: true, entries: [], rawText }; // No JSON = no extractions
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      success: false,
      entries: [],
      rawText,
      errorMessage: "Failed to parse Claude extraction response as JSON",
    };
  }

  if (!Array.isArray(parsed.extractions) || parsed.extractions.length === 0) {
    return { success: true, entries: [], rawText };
  }

  // 6. Map to memory_entry insert shapes
  const entries: MemoryEntryInsert[] = parsed.extractions
    .filter((e) => {
      // Validate: must be a valid proof lib category
      return (
        e.category &&
        e.title?.trim() &&
        e.content?.trim() &&
        (PROOF_LIBRARY_CATEGORIES as readonly string[]).includes(e.category)
      );
    })
    .map((e) => ({
      org_id: doc.org_id,
      category: e.category,
      title: e.title.trim().substring(0, 500),
      content: e.content.trim(),
      data: e.data ?? null,
      source: `document:${doc.id}`,
      auto_generated: true,
      created_by: null,
    }));

  return { success: true, entries, rawText };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Process pending documents and extract typed memory entries.
 * Called from both the cron sweeper and the wizard-completion trigger.
 *
 * @param serviceClient - Service-role Supabase client (bypasses RLS)
 * @param anthropicApiKey - Org's decrypted Anthropic API key
 * @param options - Extraction options (maxDocs, timeoutMs, dryRun, orgId)
 * @returns { processed, failed, skipped }
 */
export async function extractPendingDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  anthropicApiKey: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const { maxDocs = 50, timeoutMs = 55_000, dryRun = false, orgId } = options;
  const startTime = Date.now();
  const result: ExtractionResult = { processed: 0, failed: 0, skipped: 0 };
  // Construct the Anthropic client once, reuse across all documents in this run.
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Query: pending docs that are due for (re)processing
  // "Due" = (retry_count < 3) AND (never attempted OR last attempted > 1 hour ago)
  let query = serviceClient
    .from("documents")
    .select("id, org_id, file_name, mime_type, storage_path, category, retry_count, last_attempted_at")
    .eq("processing_status", "pending")
    .lt("retry_count", 3)
    .or("last_attempted_at.is.null,last_attempted_at.lt." + new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(maxDocs);

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data: docs, error: queryError } = await query;

  if (queryError) {
    console.error("[proof-library/extract] Failed to query pending documents:", queryError);
    return result;
  }

  if (!docs || docs.length === 0) {
    return result;
  }

  for (const doc of docs as DocumentRow[]) {
    // Check soft timeout
    if (Date.now() - startTime > timeoutMs) {
      result.skipped = docs.length - result.processed - result.failed;
      break;
    }

    // Mark as processing to prevent double-pickup
    if (!dryRun) {
      await serviceClient
        .from("documents")
        .update({
          processing_status: "processing",
          last_attempted_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
    }

    try {
      const extraction = await extractSingleDocument(serviceClient, doc, anthropic);

      if (dryRun) {
        console.log(`[proof-library/extract][dryRun] doc=${doc.id} entries=${extraction.entries.length}`);
        result.processed++;
        continue;
      }

      if (!extraction.success) {
        // Increment retry_count; if at cap (3), mark failed
        const newRetryCount = doc.retry_count + 1;
        const newStatus = newRetryCount >= 3 ? "failed" : "pending";
        await serviceClient
          .from("documents")
          .update({
            processing_status: newStatus,
            retry_count: newRetryCount,
            parsed_text: extraction.errorMessage ?? null,
          })
          .eq("id", doc.id);
        result.failed++;
        console.error(
          `[proof-library/extract] doc=${doc.id} failed (retry ${newRetryCount}/3): ${extraction.errorMessage}`
        );
        continue;
      }

      // Write memory entries (sequential insert — on partial failure, already-written
      // entries remain. This is acceptable: duplicate detection is by source + title.
      // A full atomic Postgres transaction would require a DB function; the trade-off
      // is documented in SESSION-LOG.)
      if (extraction.entries.length > 0) {
        const { error: memoryError } = await serviceClient
          .from("memory_entries")
          .insert(extraction.entries);

        if (memoryError) {
          console.error(`[proof-library/extract] doc=${doc.id} memory insert error:`, memoryError);
          // Don't mark failed — the extraction succeeded, only the write failed.
          // Leave processing_status='processing' so manual review can trigger a retry.
          await serviceClient
            .from("documents")
            .update({
              processing_status: "pending",
              retry_count: doc.retry_count + 1,
              parsed_text: `Memory insert error: ${memoryError.message}`,
            })
            .eq("id", doc.id);
          result.failed++;
          continue;
        }
      }

      // Mark done
      await serviceClient
        .from("documents")
        .update({
          processing_status: "done",
          parsed_text: extraction.rawText.substring(0, 10000) || null,
        })
        .eq("id", doc.id);

      result.processed++;
    } catch (err) {
      // Claude API error or unexpected exception — retriable
      const newRetryCount = doc.retry_count + 1;
      const newStatus = newRetryCount >= 3 ? "failed" : "pending";
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[proof-library/extract] doc=${doc.id} exception (retry ${newRetryCount}/3):`, err);
      await serviceClient
        .from("documents")
        .update({
          processing_status: newStatus,
          retry_count: newRetryCount,
          parsed_text: `Extraction exception: ${errorMsg}`,
        })
        .eq("id", doc.id);
      result.failed++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Shared helper — used by both trigger paths (cron sweeper + onboarding route)
// ---------------------------------------------------------------------------

/**
 * Fetch and decrypt an org's Anthropic API key from the DB.
 * Returns null if not set or decryption fails.
 */
export async function resolveOrgAnthropicKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string
): Promise<string | null> {
  const { data: org } = await serviceClient
    .from("orgs")
    .select("anthropic_api_key_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.anthropic_api_key_encrypted) return null;

  try {
    return decryptIfEncrypted(
      org.anthropic_api_key_encrypted as string,
      CRYPTO_LABEL_ANTHROPIC_KEY
    );
  } catch {
    return null;
  }
}
