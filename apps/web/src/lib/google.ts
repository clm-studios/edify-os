import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt, decryptIfEncrypted, CRYPTO_LABEL_GOOGLE_ACCESS_TOKEN, CRYPTO_LABEL_GOOGLE_REFRESH_TOKEN } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GOOGLE_SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar",
  gmail: "https://www.googleapis.com/auth/gmail.modify",
  drive: "https://www.googleapis.com/auth/drive.file",
  email: "https://www.googleapis.com/auth/userinfo.email",
} as const;

export const GOOGLE_INTEGRATION_TYPES = [
  "gmail",
  "google_calendar",
  "google_drive",
] as const;

export type GoogleIntegrationType = (typeof GOOGLE_INTEGRATION_TYPES)[number];

/** Scopes stored per integration row — mirrors what we request but split by service. */
export const SCOPES_BY_TYPE: Record<GoogleIntegrationType, string[]> = {
  gmail: [GOOGLE_SCOPES.gmail],
  google_calendar: [GOOGLE_SCOPES.calendar],
  google_drive: [GOOGLE_SCOPES.drive],
};

/** Cookie name for CSRF state token — shared by connect + callback routes. */
export const STATE_COOKIE = "google_oauth_state";

/** Typed shape of the config column for Google integration rows. */
export type GoogleIntegrationConfig = { google_email: string | null };

// ---------------------------------------------------------------------------
// Origin helper (H1 / M1)
// ---------------------------------------------------------------------------

/**
 * Returns the canonical app origin, pinned from env vars rather than
 * request headers (which are user-controllable and open-redirect-vulnerable).
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL  (set explicitly in Vercel — preferred)
 *   2. VERCEL_URL           (Vercel auto-sets this, no protocol — server-only fallback)
 *   3. http://localhost:3000 (local dev)
 *
 * ACTION REQUIRED for Citlali: Set NEXT_PUBLIC_APP_URL=https://edifyos.vercel.app
 * in the Vercel project environment variables (Production + Preview).
 */
export function getAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// ---------------------------------------------------------------------------
// In-process token-refresh dedup (H4)
// ---------------------------------------------------------------------------

/**
 * Deduplicates concurrent token refresh calls within a single Node process.
 * Keyed on `${orgId}:refresh`. Prevents Google from revoking the refresh token
 * when multiple requests race to use it simultaneously.
 *
 * Cross-instance dedup (multiple Vercel function instances) is out of scope here —
 * that requires a Postgres advisory lock or RPC. Deferred to a follow-up.
 */
const refreshInFlight = new Map<
  string,
  Promise<{ accessToken: string } | { error: NextResponse }>
>();

/**
 * Refreshes the Google access token using the provided refresh token.
 * @param refreshToken — must be DECRYPTED plaintext, not the raw DB value
 */
async function doRefreshToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  refreshToken: string
): Promise<{ accessToken: string } | { error: NextResponse }> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      error: NextResponse.json(
        { error: "Google OAuth credentials not configured on server" },
        { status: 500 }
      ),
    };
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[google] Token refresh failed:", errBody);
    return {
      error: NextResponse.json(
        { error: "Google token refresh failed. Please reconnect Google." },
        { status: 401 }
      ),
    };
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const newAccessToken = tokens.access_token;
  const newExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Update ALL 3 Google integration rows for this org (they share a token set)
  const updatePayload: Record<string, unknown> = {
    access_token_encrypted: encrypt(newAccessToken),
    updated_at: new Date().toISOString(),
  };
  if (newExpiresAt) updatePayload.token_expires_at = newExpiresAt;

  const { error: updateError } = await serviceClient
    .from("integrations")
    .update(updatePayload)
    .eq("org_id", orgId)
    .in("type", GOOGLE_INTEGRATION_TYPES);

  if (updateError) {
    console.error("[google] Failed to update refreshed token:", updateError);
    // Non-fatal — return the fresh token even if the DB update failed
  }

  return { accessToken: newAccessToken };
}

/**
 * Refresh the Google token for an org, deduplicating concurrent calls within
 * this Node process so only one POST hits Google's /token endpoint at a time.
 */
function refreshTokenDeduped(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  refreshToken: string
): Promise<{ accessToken: string } | { error: NextResponse }> {
  const key = `${orgId}:refresh`;
  const existing = refreshInFlight.get(key);
  if (existing) return existing;

  const promise = doRefreshToken(serviceClient, orgId, refreshToken);
  refreshInFlight.set(key, promise);
  promise.finally(() => refreshInFlight.delete(key));
  return promise;
}

// ---------------------------------------------------------------------------
// Token refresh helper
// ---------------------------------------------------------------------------

/**
 * Pure (no-NextResponse) variant of token resolution. Returns a discriminated
 * union describing the result so non-error callers (e.g. the Integrations page
 * status endpoint) can branch on it without owning HTTP shape.
 *
 * Outcomes:
 *   - `{ ok: true, accessToken }`  — caller has a fresh decrypted token
 *   - `{ ok: false, reason }`      — caller should surface as not-connected /
 *                                    needs-reconnect; `reason` describes why
 *
 * Used by both `getValidGoogleAccessToken` (which maps the result to a
 * NextResponse-style error contract) and the Integrations page connection-
 * status route (which maps it to `{ connected, authError }`).
 *
 * Named `inspectGoogleToken` (not `resolveGoogleToken`) to avoid colliding
 * with the unrelated local helper of that name in `lib/tools/registry.ts`.
 */
export type GoogleTokenInspection =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      reason:
        | "not_connected" // no row, or row not active
        | "missing_access_token" // active row but no encrypted access token
        | "decrypt_failed" // crypto error reading stored token
        | "expired_no_refresh" // token past 60s buffer, no refresh token
        | "refresh_failed"; // refresh token present but Google rejected it
    };

export async function inspectGoogleToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  integrationType: GoogleIntegrationType
): Promise<GoogleTokenInspection> {
  const { data: integration, error: dbError } = await serviceClient
    .from("integrations")
    .select(
      "id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status"
    )
    .eq("org_id", orgId)
    .eq("type", integrationType)
    .single();

  if (dbError || !integration) return { ok: false, reason: "not_connected" };
  if (integration.status !== "active") return { ok: false, reason: "not_connected" };

  const rawAccessToken = integration.access_token_encrypted as string | null;
  const rawRefreshToken = integration.refresh_token_encrypted as string | null;
  const expiresAt = integration.token_expires_at as string | null;

  if (!rawAccessToken) return { ok: false, reason: "missing_access_token" };

  // Decrypt tokens — decryptIfEncrypted handles legacy plaintext rows gracefully
  let accessToken: string | null;
  let refreshToken: string | null;
  try {
    accessToken = decryptIfEncrypted(rawAccessToken, CRYPTO_LABEL_GOOGLE_ACCESS_TOKEN);
  } catch (err) {
    console.error('[google] Failed to decrypt access token', { orgId, integrationType, error: err });
    return { ok: false, reason: "decrypt_failed" };
  }
  try {
    refreshToken = decryptIfEncrypted(rawRefreshToken, CRYPTO_LABEL_GOOGLE_REFRESH_TOKEN);
  } catch (err) {
    console.error('[google] Failed to decrypt refresh token', { orgId, integrationType, error: err });
    return { ok: false, reason: "decrypt_failed" };
  }

  if (!accessToken) return { ok: false, reason: "missing_access_token" };

  // Check if token is still valid (with 60s buffer)
  if (expiresAt) {
    const expiresMs = new Date(expiresAt).getTime();
    const nowMs = Date.now();
    if (expiresMs - nowMs > 60_000) {
      return { ok: true, accessToken };
    }
  }

  // Token expired (or no expiry stored) — refresh
  if (!refreshToken) return { ok: false, reason: "expired_no_refresh" };

  const refreshed = await refreshTokenDeduped(serviceClient, orgId, refreshToken);
  if ("error" in refreshed) return { ok: false, reason: "refresh_failed" };
  return { ok: true, accessToken: refreshed.accessToken };
}

/**
 * Returns a valid Google access token for the given org + integration type.
 * Reads the integrations row, refreshes if within 60s of expiry, and updates
 * all 3 Google rows (they share a token set) when refreshing.
 *
 * Returns { accessToken: string } or { error: NextResponse } — caller pattern
 * matches getAnthropicClientForOrg. Internally delegates to `inspectGoogleToken`
 * and maps the discriminated union onto the NextResponse error contract that
 * EA tools rely on.
 *
 * Usage:
 *   const result = await getValidGoogleAccessToken(serviceClient, orgId, 'google_calendar');
 *   if ('error' in result) return result.error;
 *   const { accessToken } = result;
 */
export async function getValidGoogleAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  integrationType: GoogleIntegrationType
): Promise<{ accessToken: string } | { error: NextResponse }> {
  const inspection = await inspectGoogleToken(serviceClient, orgId, integrationType);
  if (inspection.ok) return { accessToken: inspection.accessToken };

  switch (inspection.reason) {
    case "not_connected":
      return {
        error: NextResponse.json(
          { error: "Google integration not connected" },
          { status: 404 }
        ),
      };
    case "missing_access_token":
      return {
        error: NextResponse.json(
          { error: "Google integration missing access token" },
          { status: 500 }
        ),
      };
    case "decrypt_failed":
      return {
        error: NextResponse.json(
          { error: "Could not access stored Google credentials. Please reconnect Google in Settings." },
          { status: 500 }
        ),
      };
    case "expired_no_refresh":
      return {
        error: NextResponse.json(
          { error: "Google token expired and no refresh token available. Please reconnect Google." },
          { status: 401 }
        ),
      };
    case "refresh_failed":
      return {
        error: NextResponse.json(
          { error: "Google token refresh failed. Please reconnect Google." },
          { status: 401 }
        ),
      };
  }
}
