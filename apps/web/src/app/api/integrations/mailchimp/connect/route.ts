import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getAuthContext } from '@/lib/supabase/server';
import { getAppOrigin } from '@/lib/google';
import { MAILCHIMP_STATE_COOKIE } from '@/lib/mailchimp-oauth';

/**
 * GET /api/integrations/mailchimp/connect
 *
 * Redirects the user to Mailchimp's OAuth2 authorization screen.
 * Mirrors the shape of /api/integrations/google/connect.
 */
export async function GET() {
  const { user, memberId, orgId } = await getAuthContext();

  if (!user || !memberId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Mailchimp OAuth credentials not configured on server' },
      { status: 500 }
    );
  }

  // Pin redirect_uri — must EXACTLY match what is registered in the Mailchimp app
  const origin = getAppOrigin();
  const redirectUri = `${origin}/api/integrations/mailchimp/callback`;

  // Generate CSRF state token and embed org/member identity so the callback
  // can look up the right user without relying on session cookies alone.
  const nonce = randomBytes(24).toString('hex');
  // state = "<nonce>.<orgId>.<memberId>" — callback splits on '.' after validating nonce
  const state = `${nonce}.${orgId}.${memberId}`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`;

  // Store state in a short-lived httpOnly cookie for CSRF protection
  const cookieStore = await cookies();
  cookieStore.set(MAILCHIMP_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60, // 10 minutes
    path: '/',
  });

  return NextResponse.redirect(authUrl);
}
