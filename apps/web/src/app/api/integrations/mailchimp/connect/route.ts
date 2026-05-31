import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, getAuthContext } from '@/lib/supabase/server';
import { encrypt, CRYPTO_LABEL_MAILCHIMP_API_KEY } from '@/lib/crypto';

/**
 * POST /api/integrations/mailchimp/connect
 *
 * Accepts the org's Mailchimp API key, validates it live via GET /ping,
 * encrypts it, and upserts an integrations row for the org.
 *
 * Mailchimp API keys end with a datacenter suffix: e.g. `abc123-us21`
 * The server_prefix (us21) is derived from the key — not asked of the user.
 */
export async function POST(req: NextRequest) {
  const { user, orgId, memberId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  let apiKey: string;
  try {
    const body = await req.json();
    apiKey = (body?.api_key ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
  }

  // Derive the datacenter prefix from the key suffix (e.g. "abc123-us21" → "us21")
  const dashIdx = apiKey.lastIndexOf('-');
  if (dashIdx === -1 || dashIdx === apiKey.length - 1) {
    return NextResponse.json(
      { error: 'Invalid Mailchimp API key format. Keys must end with a datacenter suffix (e.g. -us21).' },
      { status: 400 }
    );
  }
  const serverPrefix = apiKey.slice(dashIdx + 1);
  if (!/^[a-z]{2}\d+$/.test(serverPrefix)) {
    return NextResponse.json(
      { error: `Could not determine datacenter from API key suffix "${serverPrefix}". Expected format: us1, us21, etc.` },
      { status: 400 }
    );
  }

  // Validate the key live via Mailchimp's /ping endpoint
  let pingOk = false;
  try {
    const pingRes = await fetch(
      `https://${serverPrefix}.api.mailchimp.com/3.0/ping`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    if (pingRes.ok) {
      pingOk = true;
    } else {
      const body = await pingRes.json().catch(() => ({}));
      const detail = (body as { detail?: string }).detail ?? 'API key rejected by Mailchimp.';
      return NextResponse.json(
        { error: `Mailchimp rejected the API key: ${detail}` },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Could not reach Mailchimp to validate the key. Please check your connection and try again.' },
      { status: 502 }
    );
  }

  if (!pingOk) {
    return NextResponse.json(
      { error: 'Mailchimp key validation failed. Please double-check your API key.' },
      { status: 400 }
    );
  }

  // Encrypt the key before storing
  const encryptedKey = encrypt(apiKey);

  // Upsert into integrations table — respects the unique(org_id, type) constraint
  const { error: upsertError } = await serviceClient
    .from('integrations')
    .upsert(
      {
        org_id: orgId,
        type: 'mailchimp',
        access_token_encrypted: encryptedKey,
        config: { server_prefix: serverPrefix },
        status: 'active',
        connected_by: memberId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,type' }
    );

  if (upsertError) {
    console.error('[mailchimp connect] DB upsert error:', upsertError);
    return NextResponse.json({ error: 'Failed to save Mailchimp connection' }, { status: 500 });
  }

  // Label used only for internal logging context — never log the decrypted key itself
  void CRYPTO_LABEL_MAILCHIMP_API_KEY; // imported for consistent label usage

  return NextResponse.json({ success: true });
}
