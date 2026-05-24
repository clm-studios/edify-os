/**
 * POST /api/proof-library/extract-pending
 *
 * Cron sweeper for document extraction (Sprint A.5).
 *
 * Scheduled via vercel.json cron — runs every 3 hours (piggybacking the
 * heartbeat cron schedule to respect Vercel Hobby tier's sub-daily cron
 * restriction). The cron fires against ALL orgs that have pending documents
 * due for processing.
 *
 * Can also be triggered manually (authenticated POST) for a specific org:
 *   POST /api/proof-library/extract-pending
 *   Body: { orgId: "..." }  — scoped to one org
 *   Body: {}                — sweeps all orgs (cron use only)
 *
 * Vercel Hobby cron note: this route is piggybacked on the existing 3h
 * heartbeat schedule. Sub-daily crons are silently rejected by Vercel Hobby
 * at validation time — see reference_vercel_hobby_cron_tier_limit.md.
 * The 3h interval means newly uploaded documents may wait up to 3h for
 * extraction — the wizard-completion immediate trigger covers first-run UX.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, getAuthContext } from "@/lib/supabase/server";
import { extractPendingDocuments } from "@/lib/proof-library/extract";
import { decryptIfEncrypted, CRYPTO_LABEL_ANTHROPIC_KEY } from "@/lib/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Give the sweeper enough time to process multiple documents.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth: allow either an authenticated user (manual trigger) or the cron
  // CRON_SECRET header (Vercel cron). We need the service client regardless.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCronCall =
    Boolean(cronSecret) &&
    authHeader === `Bearer ${cronSecret}`;

  let requestingOrgId: string | null = null;

  if (!isCronCall) {
    // Non-cron: require authenticated user
    const { user, orgId } = await getAuthContext();
    if (!user || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requestingOrgId = orgId;
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Parse optional orgId from body (cron sweeps all; user scopes to their org)
  let targetOrgId: string | null = requestingOrgId;
  try {
    const body = await req.json().catch(() => ({}));
    // Only allow overriding orgId for cron calls
    if (isCronCall && typeof body.orgId === "string" && body.orgId.trim()) {
      targetOrgId = body.orgId.trim();
    }
  } catch {
    // Ignore body parse errors
  }

  // ---------------------------------------------------------------------------
  // If sweeping all orgs (cron, no specific orgId): find orgs with pending docs
  // ---------------------------------------------------------------------------

  if (isCronCall && !targetOrgId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Find all orgs that have pending documents due for processing
    const { data: pendingOrgs, error: orgsError } = await serviceClient
      .from("documents")
      .select("org_id")
      .eq("processing_status", "pending")
      .lt("retry_count", 3)
      .or(`last_attempted_at.is.null,last_attempted_at.lt.${oneHourAgo}`);

    if (orgsError) {
      console.error("[proof-library/extract-pending] Org query error:", orgsError);
      return NextResponse.json({ error: "Failed to query pending orgs" }, { status: 500 });
    }

    // Deduplicate org IDs
    const orgIds = [
      ...new Set(
        (pendingOrgs ?? []).map((r: { org_id: string }) => r.org_id)
      ),
    ];

    if (orgIds.length === 0) {
      return NextResponse.json({ message: "No pending documents", orgsProcessed: 0 });
    }

    const summary: Record<string, { processed: number; failed: number; skipped: number }> = {};
    let totalProcessed = 0;
    let totalFailed = 0;

    for (const orgId of orgIds) {
      const apiKey = await resolveOrgAnthropicKey(serviceClient, orgId);
      if (!apiKey) {
        console.warn(`[proof-library/extract-pending] Org ${orgId} has no Anthropic key — skipping`);
        continue;
      }

      const result = await extractPendingDocuments(serviceClient, apiKey, {
        orgId,
        maxDocs: 10, // Per-org cap in bulk sweep — prevents one large org monopolizing the run
        timeoutMs: 45_000,
      });

      summary[orgId] = result;
      totalProcessed += result.processed;
      totalFailed += result.failed;
    }

    return NextResponse.json({
      message: "Sweep complete",
      orgsProcessed: orgIds.length,
      totalProcessed,
      totalFailed,
      summary,
    });
  }

  // ---------------------------------------------------------------------------
  // Single-org run (manual trigger or cron with explicit orgId)
  // ---------------------------------------------------------------------------

  if (!targetOrgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const apiKey = await resolveOrgAnthropicKey(serviceClient, targetOrgId);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key configured for this org" },
      { status: 402 }
    );
  }

  const result = await extractPendingDocuments(serviceClient, apiKey, {
    orgId: targetOrgId,
    maxDocs: 20,
    timeoutMs: 50_000,
  });

  return NextResponse.json({
    message: "Extraction complete",
    orgId: targetOrgId,
    ...result,
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveOrgAnthropicKey(
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
