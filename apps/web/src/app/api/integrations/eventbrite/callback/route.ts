import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { getAppOrigin } from '@/lib/google';
import { EVENTBRITE_STATE_COOKIE, getEventbriteRedirectUri } from '@/lib/eventbrite-oauth';

/**
 * GET /api/integrations/eventbrite/callback
 *
 * Eventbrite OAuth2 callback. Exchanges the code for an access token, resolves
 * the org's Eventbrite organization_id via /users/me/organizations/, encrypts
 * the token, and upserts the integrations row.
 *
 * Mirrors the shape of /api/integrations/mailchimp/callback.
 *
 * Eventbrite private OAuth tokens do NOT expire and there is NO refresh token —
 * we store only the access token.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // Pin origin from env — never derive from request headers (open-redirect risk)
  const origin = getAppOrigin();

  // Helper: clear state cookie and redirect
  async function clearAndRedirect(target: string): Promise<NextResponse> {
    const cookieStore = await cookies();
    cookieStore.delete(EVENTBRITE_STATE_COOKIE);
    return NextResponse.redirect(target);
  }

  // --- User denied access ---
  if (errorParam) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=${encodeURIComponent(errorParam)}`
    );
  }

  // --- CSRF state validation ---
  const cookieStore = await cookies();
  const storedState = cookieStore.get(EVENTBRITE_STATE_COOKIE)?.value;

  if (!storedState || storedState !== state) {
    return clearAndRedirect(`${origin}/dashboard/integrations?eventbrite=denied&reason=state_mismatch`);
  }

  if (!code) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=no_code`
    );
  }

  // Extract orgId + memberId from state (<nonce>.<orgId>.<memberId>)
  const stateParts = storedState.split('.');
  // nonce is 48 hex chars; orgId and memberId are UUIDs (contain hyphens, no dots)
  if (stateParts.length < 3) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=invalid_state`
    );
  }
  // nonce is first segment; orgId and memberId are the last two
  const orgId = stateParts[stateParts.length - 2];
  const memberId = stateParts[stateParts.length - 1];

  if (!orgId || !memberId) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=invalid_state`
    );
  }

  const clientId = process.env.EVENTBRITE_CLIENT_ID;
  const clientSecret = process.env.EVENTBRITE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=server_config_error`
    );
  }

  const redirectUri = getEventbriteRedirectUri();

  // --- Exchange code for access token ---
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://www.eventbrite.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[eventbrite/callback] Token exchange failed:', errBody);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?eventbrite=denied&reason=token_exchange_failed`
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      token_type?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      console.error('[eventbrite/callback] No access_token in response:', tokenData);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?eventbrite=denied&reason=no_access_token`
      );
    }

    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('[eventbrite/callback] Token exchange threw:', err);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=token_exchange_failed`
    );
  }

  // --- Resolve the org's Eventbrite organization_id ---
  // GET /users/me/organizations/ → { organizations: [{ id, name, ... }] }
  // The tools need organization_id to list events. If the user has zero
  // organizations, fail gracefully rather than writing a half-broken row.
  let organizationId: string;
  let organizationName: string | undefined;
  try {
    const orgRes = await fetch(
      'https://www.eventbriteapi.com/v3/users/me/organizations/',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!orgRes.ok) {
      const errBody = await orgRes.text();
      console.error('[eventbrite/callback] Organizations fetch failed:', errBody);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?eventbrite=denied&reason=organizations_failed`
      );
    }

    const orgData = (await orgRes.json()) as {
      organizations?: Array<{ id?: string; name?: string }>;
    };

    const firstOrg = orgData.organizations?.[0];
    if (!firstOrg?.id) {
      console.error('[eventbrite/callback] No Eventbrite organizations on account');
      return clearAndRedirect(
        `${origin}/dashboard/integrations?eventbrite=denied&reason=no_organization`
      );
    }

    organizationId = firstOrg.id;
    organizationName = firstOrg.name;
  } catch (err) {
    console.error('[eventbrite/callback] Organizations fetch threw:', err);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=organizations_failed`
    );
  }

  // --- Encrypt access token + upsert integration row ---
  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=db_unavailable`
    );
  }

  const encryptedToken = encrypt(accessToken);

  const { error: upsertError } = await serviceClient
    .from('integrations')
    .upsert(
      {
        org_id: orgId,
        type: 'eventbrite',
        access_token_encrypted: encryptedToken,
        config: { organization_id: organizationId, organization_name: organizationName },
        status: 'active',
        connected_by: memberId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,type' }
    );

  if (upsertError) {
    console.error('[eventbrite/callback] Failed to upsert integrations:', upsertError);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?eventbrite=denied&reason=db_error`
    );
  }

  return clearAndRedirect(`${origin}/dashboard/integrations?eventbrite=connected`);
}
