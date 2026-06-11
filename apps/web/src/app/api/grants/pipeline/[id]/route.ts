/**
 * PATCH /api/grants/pipeline/[id] — update status, notes, or append a draft
 *
 * Drafts are append-only per PRD §F2: "The grants_pipeline.drafts jsonb
 * column is append-only. Never delete a draft; revisions create new versions."
 * This endpoint enforces that contract — appending to the jsonb array rather
 * than replacing it.
 *
 * M3 FIX (2026-06-10): draft appends are now atomic via the
 * `append_pipeline_draft` Postgres RPC (migration 00041).  The previous
 * read-modify-write pattern (SELECT drafts → JS append → UPDATE whole array)
 * had a race: two concurrent PATCHes could read the same array and the second
 * write would silently drop the first draft and duplicate version numbers.
 * The RPC eliminates that window with a FOR UPDATE row lock + single UPDATE.
 *
 * Status transitions: only forward-direction moves are valid. This is enforced
 * by the UI (W2 drawer), not the API — the API accepts any valid status to
 * stay flexible for tool calls that might advance status programmatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, getAuthContext } from "@/lib/supabase/server";
import type { PipelineStatus, GrantPipelineRow } from "../route";

interface PatchPipelineBody {
  status?: PipelineStatus;
  notes?: string;
  /** New draft to append. Triggers version auto-increment. */
  draft?: {
    section: string;
    content_md: string;
    drafted_by_tool: string;
  };
  org_fit_score?: number;
}

const VALID_STATUSES: PipelineStatus[] = [
  "discovered", "verification", "drafting",
  "internal_review", "submitted", "won", "lost", "withdrawn",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { user, orgId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let body: PatchPipelineBody;
  try {
    body = (await req.json()) as PatchPipelineBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Draft append path — handled entirely by the atomic Postgres RPC.
  // Migration 00041 defines append_pipeline_draft(); it acquires a row-level
  // FOR UPDATE lock and appends the new draft object in a single UPDATE
  // statement, computing the version number from the live DB state.
  // This eliminates the read-modify-write race in the previous implementation.
  //
  // If a status override is also present in the body, we apply it in the
  // non-draft path below after the RPC returns.
  // -------------------------------------------------------------------------
  if (body.draft) {
    const autoAdvance =
      !body.status; // only auto-advance when no explicit status override

    const { data: rpcRows, error: rpcError } = await serviceClient.rpc(
      "append_pipeline_draft",
      {
        p_id: id,
        p_org_id: orgId,
        p_section: body.draft.section,
        p_content_md: body.draft.content_md,
        p_drafted_by_tool: body.draft.drafted_by_tool,
        p_drafted_at: new Date().toISOString(),
        p_auto_advance: autoAdvance,
      },
    );

    if (rpcError) {
      console.error("[grants-pipeline] append_pipeline_draft RPC error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // RPC returns SETOF — empty means the row wasn't found (wrong id/org)
    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : null;
    if (!rpcResult) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    // If a status override was also requested (e.g. tool wants to explicitly
    // set status while appending a draft), apply it now via a separate UPDATE.
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status: ${body.status}. Valid: ${VALID_STATUSES.join(", ")}` },
          { status: 400 },
        );
      }
      const { data: withStatus, error: statusError } = await serviceClient
        .from("grants_pipeline")
        .update({ status: body.status })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (statusError) {
        console.error("[grants-pipeline] PATCH status error after draft append:", statusError);
        return NextResponse.json({ error: statusError.message }, { status: 500 });
      }
      return NextResponse.json({ data: withStatus });
    }

    return NextResponse.json({ data: rpcResult as GrantPipelineRow });
  }

  // -------------------------------------------------------------------------
  // Non-draft path: status, notes, org_fit_score updates only.
  // No concurrency risk here — these are scalar fields, last-write-wins is
  // acceptable for status/notes edits (same UX expectation as any text field).
  // -------------------------------------------------------------------------

  // Verify the row belongs to the caller's org before building the update
  const { data: existing, error: fetchError } = await serviceClient
    .from("grants_pipeline")
    .select("id, org_id, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  }

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status: ${body.status}. Valid: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    updateData.status = body.status;
  }

  if (body.notes !== undefined) {
    updateData.notes = typeof body.notes === "string" ? body.notes : null;
  }

  if (typeof body.org_fit_score === "number") {
    updateData.org_fit_score = body.org_fit_score;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("grants_pipeline")
    .update(updateData)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (updateError) {
    console.error("[grants-pipeline] PATCH error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}
