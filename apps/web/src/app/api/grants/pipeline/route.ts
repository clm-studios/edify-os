/**
 * GET  /api/grants/pipeline  — list current org's grants pipeline
 * POST /api/grants/pipeline  — create a pipeline entry from a discovery result
 *
 * Schema: grants_pipeline table (migration 00040_grants_pipeline.sql).
 * RLS enforces org isolation via current_user_org_ids() — service-role client
 * bypasses RLS for server-side writes; auth context validates the caller.
 *
 * M5 FIX (2026-06-10): GET now accepts limit/offset query params with
 * bounds-checking and a default limit of 200.  The previous select("*") with
 * no limit returned the full table for the org on every page load, which
 * would degrade without bound as pipelines grow.
 *
 * Consumer note: the /dashboard/grants page fetches without explicit
 * limit/offset and does client-side tab filtering.  The 200-row default is
 * high enough to be invisible at current scale; if an org exceeds 200 rows
 * the page will silently show only the first 200 (ordered by updated_at DESC).
 * A meta.total field is included in the response so callers can detect
 * truncation and paginate if needed — it is additive and backward-compatible.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, getAuthContext } from "@/lib/supabase/server";

// Pipeline status values — must match DB constraint
export type PipelineStatus =
  | "discovered"
  | "verification"
  | "drafting"
  | "internal_review"
  | "submitted"
  | "won"
  | "lost"
  | "withdrawn";

export interface GrantPipelineRow {
  id: string;
  org_id: string;
  grant_id: string;
  source: string;
  funder_name: string;
  opportunity_title: string;
  amount_min: number | null;
  amount_max: number | null;
  due_date: string | null;
  status: PipelineStatus;
  citation_url: string;
  org_fit_score: number | null;
  drafts: GrantDraft[];
  attachments_checklist: AttachmentItem[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GrantDraft {
  section: string;
  content_md: string;
  version: number;
  drafted_at: string;
  drafted_by_tool: string;
}

export interface AttachmentItem {
  label: string;
  required: boolean;
  checked: boolean;
}

const VALID_STATUSES: PipelineStatus[] = [
  "discovered", "verification", "drafting",
  "internal_review", "submitted", "won", "lost", "withdrawn",
];

// ---------------------------------------------------------------------------
// GET /api/grants/pipeline
// Query params:
//   status  — optional filter, comma-separated PipelineStatus values
//   limit   — max rows to return (default 200, max 1000)
//   offset  — rows to skip for pagination (default 0, min 0)
// Response shape: { data: GrantPipelineRow[], meta: { total: number } }
//   meta.total reflects the count BEFORE pagination so callers can detect
//   truncation.  The shape is backward-compatible: existing consumers that
//   destructure { data } continue to work unchanged.
// ---------------------------------------------------------------------------

const GET_DEFAULT_LIMIT = 200;
const GET_MAX_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const { user, orgId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);

  // Status filter
  const statusParam = searchParams.get("status");
  const statusFilter = statusParam
    ? statusParam.split(",").filter((s): s is PipelineStatus => VALID_STATUSES.includes(s as PipelineStatus))
    : null;

  // Pagination — parse, clamp, and validate
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");

  const parsedLimit = rawLimit !== null ? parseInt(rawLimit, 10) : GET_DEFAULT_LIMIT;
  const parsedOffset = rawOffset !== null ? parseInt(rawOffset, 10) : 0;

  if (
    !Number.isFinite(parsedLimit) ||
    parsedLimit < 1 ||
    !Number.isFinite(parsedOffset) ||
    parsedOffset < 0
  ) {
    return NextResponse.json(
      { error: "limit must be ≥1, offset must be ≥0" },
      { status: 400 },
    );
  }

  const limit = Math.min(parsedLimit, GET_MAX_LIMIT);
  const offset = parsedOffset;

  // Base query with count for meta.total — apply status filter before range()
  // (range must be the last builder call before execution)
  let query = serviceClient
    .from("grants_pipeline")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error("[grants-pipeline] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    meta: { total: count ?? 0 },
  });
}

// ---------------------------------------------------------------------------
// POST /api/grants/pipeline — create from discovery result
// ---------------------------------------------------------------------------

interface CreatePipelineBody {
  grant_id: string;
  source: string;
  funder_name: string;
  opportunity_title: string;
  amount_min?: number;
  amount_max?: number;
  due_date?: string;
  citation_url: string;
  org_fit_score?: number;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const { user, orgId, memberId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: CreatePipelineBody;
  try {
    body = (await req.json()) as CreatePipelineBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { grant_id, source, funder_name, opportunity_title, citation_url } = body;

  if (!grant_id || typeof grant_id !== "string" || grant_id.trim().length === 0) {
    return NextResponse.json({ error: "grant_id is required" }, { status: 400 });
  }
  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  if (!funder_name || typeof funder_name !== "string") {
    return NextResponse.json({ error: "funder_name is required" }, { status: 400 });
  }
  if (!opportunity_title || typeof opportunity_title !== "string") {
    return NextResponse.json({ error: "opportunity_title is required" }, { status: 400 });
  }
  if (!citation_url || typeof citation_url !== "string") {
    return NextResponse.json({ error: "citation_url is required" }, { status: 400 });
  }

  const insertData = {
    org_id: orgId,
    grant_id: grant_id.trim(),
    source: source.trim(),
    funder_name: funder_name.trim(),
    opportunity_title: opportunity_title.trim(),
    amount_min: typeof body.amount_min === "number" ? body.amount_min : null,
    amount_max: typeof body.amount_max === "number" ? body.amount_max : null,
    due_date: body.due_date ?? null,
    citation_url: citation_url.trim(),
    org_fit_score: typeof body.org_fit_score === "number" ? body.org_fit_score : null,
    status: "discovered" as PipelineStatus,
    drafts: [],
    notes: body.notes ?? null,
    created_by: memberId ?? null,
  };

  const { data: inserted, error: insertError } = await serviceClient
    .from("grants_pipeline")
    .insert(insertData)
    .select("*")
    .single();

  if (insertError) {
    // Unique constraint violation = already in pipeline (same grant_id + source for this org)
    if (insertError.code === "23505") {
      const { data: existing } = await serviceClient
        .from("grants_pipeline")
        .select("*")
        .eq("org_id", orgId)
        .eq("grant_id", grant_id.trim())
        .eq("source", source.trim())
        .single();

      return NextResponse.json(
        { data: existing, message: "Grant already in pipeline" },
        { status: 200 },
      );
    }
    console.error("[grants-pipeline] POST error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}
