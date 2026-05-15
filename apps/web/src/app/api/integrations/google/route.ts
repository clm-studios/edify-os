import { NextResponse } from "next/server";
import { getAuthContext, createServiceRoleClient } from "@/lib/supabase/server";
import {
  GOOGLE_INTEGRATION_TYPES,
  inspectGoogleToken,
  type GoogleIntegrationConfig,
} from "@/lib/google";

export type GoogleIntegrationStatusResponse = {
  connected: boolean;
  email: string | null;
  /** True when an `active` row exists but the stored token is unusable
   *  (expired, refresh failed, decrypt failed). Drives the page UI to surface
   *  "Google token expired. Please reconnect." instead of the never-connected
   *  state. Matches the contract used by /api/integrations/google/today-events. */
  authError?: boolean;
};

/** GET /api/integrations/google — current Google connection status for the org.
 *
 *  Validates token freshness via the shared `inspectGoogleToken` helper that
 *  the EA tools use (`getValidGoogleAccessToken` delegates to the same helper),
 *  so a stale-token Gmail account no longer reports "Connected" on the
 *  Integrations page while EA tools fail with GOOGLE_NOT_CONNECTED
 *  (Bug 6, Option A — diagnostic 2026-05-13).
 */
export async function GET() {
  const { user, orgId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await serviceClient
    .from("integrations")
    .select("type, status, config")
    .eq("org_id", orgId)
    .eq("status", "active")
    .in("type", GOOGLE_INTEGRATION_TYPES)
    .limit(1);

  if (error) {
    console.error("[google GET] DB error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return NextResponse.json({
      connected: false,
      email: null,
    } satisfies GoogleIntegrationStatusResponse);
  }

  const googleEmail =
    (rows[0].config as GoogleIntegrationConfig | null)?.google_email ?? null;
  const integrationType = rows[0].type as (typeof GOOGLE_INTEGRATION_TYPES)[number];

  // Validate token freshness with the same helper the EA tools use. If the
  // stored token is unusable (expired with no/dead refresh, decrypt error,
  // etc.) we surface `connected: false + authError: true` so the page can
  // tell the user "expired, reconnect" instead of falsely implying success.
  // Token refresh will silently rotate the access token and update all 3 rows
  // (see refreshTokenDeduped in lib/google.ts).
  const inspection = await inspectGoogleToken(serviceClient, orgId, integrationType);
  if (inspection.ok) {
    return NextResponse.json({
      connected: true,
      email: googleEmail,
    } satisfies GoogleIntegrationStatusResponse);
  }

  return NextResponse.json({
    connected: false,
    email: googleEmail,
    authError: true,
  } satisfies GoogleIntegrationStatusResponse);
}

/**
 * DELETE /api/integrations/google — soft-disconnect Google (marks all 3 rows revoked).
 * Soft-delete matches the pattern in /api/integrations (DELETE handler) which uses
 * status='revoked'. Hard-delete is avoided so audit history is preserved.
 */
export async function DELETE() {
  const { user, orgId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { error } = await serviceClient
    .from("integrations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .in("type", GOOGLE_INTEGRATION_TYPES);

  if (error) {
    console.error("[google DELETE] DB error:", error);
    return NextResponse.json({ error: "Failed to disconnect Google" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
