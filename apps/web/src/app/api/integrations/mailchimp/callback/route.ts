import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { getAppOrigin } from '@/lib/google';
import { MAILCHIMP_STATE_COOKIE } from '@/lib/mailchimp-oauth';

/**
 * GET /api/integrations/mailchimp/callback
 *
 * Mailchimp OAuth2 callback. Exchanges the code for an access token, resolves
 * the org's datacenter via the metadata endpoint, encrypts the token, and
 * upserts the integrations row.
 *
 * Mirrors the shape of /api/integrations/google/callback.
 *
 * Mailchimp tokens do NOT expire and there is NO refresh token — we store
 * only the access token.
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
    cookieStore.delete(MAILCHIMP_STATE_COOKIE);
    return NextResponse.redirect(target);
  }

  // --- User denied access ---
  if (errorParam) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=${encodeURIComponent(errorParam)}`
    );
  }

  // --- CSRF state validation ---
  const cookieStore = await cookies();
  const storedState = cookieStore.get(MAILCHIMP_STATE_COOKIE)?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.json(
      { error: 'OAuth state mismatch (possible CSRF attempt)' },
      { status: 400 }
    );
  }

  if (!code) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=no_code`
    );
  }

  // Extract orgId + memberId from state (<nonce>.<orgId>.<memberId>)
  const stateParts = storedState.split('.');
  // nonce is 48 hex chars; orgId and memberId are UUIDs (contain hyphens, no dots)
  if (stateParts.length < 3) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=invalid_state`
    );
  }
  // nonce is first segment; orgId and memberId are the last two
  const orgId = stateParts[stateParts.length - 2];
  const memberId = stateParts[stateParts.length - 1];

  if (!orgId || !memberId) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=invalid_state`
    );
  }

  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=server_config_error`
    );
  }

  const redirectUri = `${origin}/api/integrations/mailchimp/callback`;

  // --- Exchange code for access token ---
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://login.mailchimp.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[mailchimp/callback] Token exchange failed:', errBody);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?mailchimp=denied&reason=token_exchange_failed`
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      console.error('[mailchimp/callback] No access_token in response:', tokenData);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?mailchimp=denied&reason=no_access_token`
      );
    }

    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('[mailchimp/callback] Token exchange threw:', err);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=token_exchange_failed`
    );
  }

  // --- Resolve datacenter via metadata endpoint ---
  // Returns { dc, api_endpoint, login, ... } — dc is the server_prefix (e.g. "us21")
  let dc: string;
  let apiEndpoint: string;
  try {
    const metaRes = await fetch('https://login.mailchimp.com/oauth2/metadata', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.text();
      console.error('[mailchimp/callback] Metadata fetch failed:', errBody);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?mailchimp=denied&reason=metadata_failed`
      );
    }

    const meta = (await metaRes.json()) as {
      dc?: string;
      api_endpoint?: string;
    };

    if (!meta.dc || !meta.api_endpoint) {
      console.error('[mailchimp/callback] Metadata missing dc or api_endpoint:', meta);
      return clearAndRedirect(
        `${origin}/dashboard/integrations?mailchimp=denied&reason=metadata_incomplete`
      );
    }

    dc = meta.dc;
    apiEndpoint = meta.api_endpoint;
  } catch (err) {
    console.error('[mailchimp/callback] Metadata fetch threw:', err);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=metadata_failed`
    );
  }

  // --- Encrypt access token + upsert integration row ---
  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=db_unavailable`
    );
  }

  const encryptedToken = encrypt(accessToken);

  const { error: upsertError } = await serviceClient
    .from('integrations')
    .upsert(
      {
        org_id: orgId,
        type: 'mailchimp',
        access_token_encrypted: encryptedToken,
        config: { server_prefix: dc, api_endpoint: apiEndpoint },
        status: 'active',
        connected_by: memberId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,type' }
    );

  if (upsertError) {
    console.error('[mailchimp/callback] Failed to upsert integrations:', upsertError);
    return clearAndRedirect(
      `${origin}/dashboard/integrations?mailchimp=denied&reason=db_error`
    );
  }

  return clearAndRedirect(`${origin}/dashboard/integrations?mailchimp=connected`);
}
