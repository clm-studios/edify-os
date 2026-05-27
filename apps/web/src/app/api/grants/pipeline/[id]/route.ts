/**
 * PATCH /api/grants/pipeline/[id] — update status, notes, or append a draft
 *
 * Drafts are append-only per PRD §F2: "The grants_pipeline.drafts jsonb
 * column is append-only. Never delete a draft; revisions create new versions."
 * This endpoint enforces that contract — appending to the jsonb array rather
 * than replacing it.
 *
 * Status transitions: only forward-direction moves are valid. This is enforced
 * by the UI (W2 drawer), not the API — the API accepts any valid status to
 * stay flexible for tool calls that might advance status programmatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, getAuthContext } from "@/lib/supabase/server";
import type { PipelineStatus, GrantDraft } from "../route";

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

  // Verify the row belongs to the caller's org
  const { data: existing, error: fetchError } = await serviceClient
    .from("grants_pipeline")
    .select("id, org_id, drafts, status")
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

  // Append-only draft handling
  if (body.draft) {
    const currentDrafts = (existing.drafts as GrantDraft[]) ?? [];
    const nextVersion = currentDrafts.length + 1;
    const newDraft: GrantDraft = {
      section: body.draft.section,
      content_md: body.draft.content_md,
      version: nextVersion,
      drafted_at: new Date().toISOString(),
      drafted_by_tool: body.draft.drafted_by_tool,
    };
    updateData.drafts = [...currentDrafts, newDraft];

    // Auto-advance to drafting status if still at discovered/verification
    if (
      !body.status &&
      (existing.status === "discovered" || existing.status === "verification")
    ) {
      updateData.status = "drafting";
    }
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
