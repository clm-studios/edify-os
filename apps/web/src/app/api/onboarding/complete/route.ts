import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, getAuthContext } from '@/lib/supabase/server';
import { extractPendingDocuments } from '@/lib/proof-library/extract';
import { decryptIfEncrypted, CRYPTO_LABEL_ANTHROPIC_KEY } from '@/lib/crypto';

/**
 * POST /api/onboarding/complete
 *
 * Persists the briefing-form payload, seeds org memory, and triggers immediate
 * document extraction for any documents uploaded during the briefing wizard.
 *
 * Write order (sequential, NOT wrapped in a Postgres transaction — Supabase JS
 * client does not expose raw BEGIN/COMMIT in Edge routes):
 *   1. UPDATE orgs — sets briefing fields + onboarding_completed_at.
 *   2. INSERT memory_entries (bulk) — org_profile preamble + per-program
 *      entries + goals entry.
 *   3. EXTRACT pending documents — SYNCHRONOUS (Option A chosen — see below).
 *
 * UX Decision: Option A — Synchronous extraction on wizard completion.
 *
 * Rationale for choosing Option A over Option B (async):
 *   The product goal is "visibly better than ChatGPT FROM THE FIRST INTERACTION"
 *   (Z's explicit bar). Onboarding completion is the ONE moment in the entire
 *   user journey where we have guaranteed advance notice that the user is about
 *   to hit the dashboard for the first time. If extraction runs async:
 *     - User lands on dashboard, clicks Dev Director, asks "what grants have we
 *       applied for?" → generic response. That IS the ChatGPT experience.
 *     - The 3h cron sweeper is the right fallback for ONGOING extraction
 *       (user uploads a new doc 3 months in), but it's wrong for the first-run
 *       moment when the user is literally watching a loading screen anyway.
 *   A brief "setting up your team…" loading state (30-60s) is a well-established
 *   post-onboarding UX pattern (Notion, Slack, Linear all do it). Users expect
 *   a processing moment at the end of a multi-step wizard. The guarantee that
 *   the first interaction is context-aware is worth the wait.
 *
 *   Edge cases:
 *   - Doc count cap: maxDocs=5 to prevent unbounded blocking on a 50-file upload.
 *     Remaining docs fall through to the 3h cron sweeper.
 *   - Extraction errors do NOT block the 200 — if extraction fails, the user
 *     lands on dashboard with the cron sweeper as fallback. Fail-safe, not fail-stop.
 *   - Timeout: timeoutMs=45_000 gives us 45s within Vercel Hobby's 60s limit.
 *   - No Anthropic key: gracefully skipped, cron handles it.
 *
 * Guards:
 * - Rejects unauthenticated requests (401).
 * - Rejects requests from users with no org/member row (403).
 * - Idempotent: if onboarding_completed_at is already set, returns 409.
 *
 * Body shape (matches briefing form state):
 *   orgProfile: { orgName, missionStatement, website, annualBudget,
 *                 fullTimeStaff, regularVolunteers, orgType,
 *                 primaryServiceArea, foundedYear }
 *   programs: { programs: [{ id, name, description, annualBudget,
 *                            peopleServed, keyOutcomes }] }
 *   goals: { selectedGoals: string[], additionalContext: string }
 *
 * Returns: { orgId: string, redirectTo: "/dashboard", extractionResult?: { processed, failed, skipped } }
 */

interface OrgProfilePayload {
  orgName: string;
  missionStatement: string;
  website?: string;
  annualBudget?: string;
  fullTimeStaff?: string;
  regularVolunteers?: string;
  orgType?: string;
  primaryServiceArea?: string;
  foundedYear?: string;
}

interface ProgramPayload {
  id?: string;
  name: string;
  description?: string;
  annualBudget?: string;
  peopleServed?: string;
  keyOutcomes?: string;
  // legacy field name from org-context.ts shape (briefing page maps to targetPopulation)
  targetPopulation?: string;
}

interface BriefingBody {
  orgProfile: OrgProfilePayload;
  programs: { programs: ProgramPayload[] };
  goals: { selectedGoals: string[]; additionalContext: string };
}

export async function POST(req: NextRequest) {
  // 1. Auth check — user + org membership required.
  const { user, orgId, memberId } = await getAuthContext();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json(
      { error: 'No org found. Complete /onboarding first.' },
      { status: 403 }
    );
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 2. Idempotency — reject if briefing already completed.
  const { data: existingOrg } = await serviceClient
    .from('orgs')
    .select('onboarding_completed_at')
    .eq('id', orgId)
    .single();

  if (existingOrg?.onboarding_completed_at) {
    return NextResponse.json(
      { orgId, redirectTo: '/dashboard', alreadyComplete: true },
      { status: 409 }
    );
  }

  // 3. Parse body.
  let body: BriefingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orgProfile, programs, goals } = body;

  if (!orgProfile?.orgName?.trim()) {
    return NextResponse.json({ error: 'orgName is required' }, { status: 400 });
  }

  // 4. Sequential write — org update then memory entries.
  // See docstring for partial-success semantics.
  //
  // Step 4a: Update org with briefing fields.
  const completedAt = new Date().toISOString();
  const { error: orgUpdateError } = await serviceClient
    .from('orgs')
    .update({
      name: orgProfile.orgName.trim(),
      mission: orgProfile.missionStatement?.trim() || null,
      website: orgProfile.website?.trim() || null,
      annual_budget: orgProfile.annualBudget?.trim() || null,
      full_time_staff: orgProfile.fullTimeStaff?.trim() || null,
      regular_volunteers: orgProfile.regularVolunteers?.trim() || null,
      org_type: orgProfile.orgType?.trim() || null,
      primary_service_area: orgProfile.primaryServiceArea?.trim() || null,
      founded_year: orgProfile.foundedYear?.trim() || null,
      onboarding_completed_at: completedAt,
    })
    .eq('id', orgId);

  if (orgUpdateError) {
    console.error('[onboarding/complete] Org update error:', orgUpdateError);
    return NextResponse.json(
      { error: 'Failed to save org profile' },
      { status: 500 }
    );
  }

  // Step 4b: Build memory entries — org_profile preamble (F3) + per-program
  //          entries + goals entry.
  const filteredPrograms = (programs?.programs ?? []).filter(
    (p) => p.name?.trim()
  );

  // F3: org-profile preamble as a single memory entry (category: org_profile).
  const orgPreamble = buildOrgPreamble(orgProfile, filteredPrograms, goals);

  const memoryInserts: Array<{
    org_id: string;
    category: string;
    title: string;
    content: string;
    source: string;
    auto_generated: boolean;
    created_by: string | null;
  }> = [
    {
      org_id: orgId,
      category: 'org_profile',
      title: 'Organization Profile',
      content: orgPreamble,
      source: 'briefing',
      auto_generated: true,
      created_by: memberId ?? null,
    },
  ];

  // Per-program memory entries (category: programs).
  for (const p of filteredPrograms) {
    const parts: string[] = [];
    if (p.description?.trim()) parts.push(p.description.trim());
    if (p.annualBudget?.trim()) {
      const num = parseInt(p.annualBudget, 10);
      parts.push(`Annual budget: $${isNaN(num) ? p.annualBudget : num.toLocaleString()}`);
    }
    if (p.peopleServed?.trim()) {
      const num = parseInt(p.peopleServed, 10);
      parts.push(`People served per year: ${isNaN(num) ? p.peopleServed : num.toLocaleString()}`);
    }
    // Support both field names from the form
    const population = p.targetPopulation?.trim() || '';
    if (population) parts.push(`Target population: ${population}`);
    if (p.keyOutcomes?.trim()) parts.push(`Key outcomes: ${p.keyOutcomes.trim()}`);

    memoryInserts.push({
      org_id: orgId,
      category: 'programs',
      title: p.name.trim(),
      content: parts.join('\n') || p.name.trim(),
      source: 'briefing',
      auto_generated: false,
      created_by: memberId ?? null,
    });
  }

  // Goals memory entry (category: general).
  const goalsContent = buildGoalsContent(goals);
  if (goalsContent) {
    memoryInserts.push({
      org_id: orgId,
      category: 'general',
      title: 'Organizational Priorities',
      content: goalsContent,
      source: 'briefing',
      auto_generated: false,
      created_by: memberId ?? null,
    });
  }

  const { error: memoryError } = await serviceClient
    .from('memory_entries')
    .insert(memoryInserts);

  if (memoryError) {
    console.error('[onboarding/complete] Memory insert error:', memoryError);
    // Org update already succeeded; partial success is acceptable — the
    // preamble can be re-created from settings. Do not block the user.
    // Log for follow-up but return success.
  }

  // Step 5: Immediate extraction trigger (wizard-completion path).
  // Synchronous / Option A — blocks on extraction before returning 200.
  // See docstring for full UX reasoning. Non-fatal: extraction errors are
  // logged but do NOT prevent the user from reaching /dashboard.
  let extractionResult: { processed: number; failed: number; skipped: number } | null = null;

  try {
    // Get org's Anthropic API key for extraction
    const { data: orgData } = await serviceClient
      .from('orgs')
      .select('anthropic_api_key_encrypted')
      .eq('id', orgId)
      .single();

    const apiKey = orgData?.anthropic_api_key_encrypted
      ? decryptIfEncrypted(
          orgData.anthropic_api_key_encrypted as string,
          CRYPTO_LABEL_ANTHROPIC_KEY
        )
      : null;

    if (apiKey) {
      // Cap at 5 docs so a large briefing upload doesn't block indefinitely.
      // Remaining docs are handled by the 3h cron sweeper.
      extractionResult = await extractPendingDocuments(serviceClient, apiKey, {
        orgId,
        maxDocs: 5,
        timeoutMs: 45_000,
      });
      console.log('[onboarding/complete] Immediate extraction result:', extractionResult);
    }
  } catch (extractionErr) {
    // Extraction failure does NOT block the user — cron is the safety net.
    console.error('[onboarding/complete] Immediate extraction error (non-fatal):', extractionErr);
  }

  return NextResponse.json(
    {
      orgId,
      redirectTo: '/dashboard',
      ...(extractionResult ? { extractionResult } : {}),
    },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOrgPreamble(
  org: OrgProfilePayload,
  programs: ProgramPayload[],
  goals: { selectedGoals: string[]; additionalContext: string }
): string {
  const lines: string[] = [
    `Organization: ${org.orgName.trim()}`,
    `Website: ${org.website?.trim() || 'not provided'}`,
    `Founded: ${org.foundedYear?.trim() || 'not provided'}`,
    `Org type: ${org.orgType?.trim() || 'not provided'}`,
    `Primary service area: ${org.primaryServiceArea?.trim() || 'not provided'}`,
    '',
    `Mission: ${org.missionStatement?.trim() || 'not provided'}`,
    '',
    `Annual budget: ${org.annualBudget?.trim() || 'not provided'}`,
    `Full-time staff: ${org.fullTimeStaff?.trim() || 'not provided'}`,
    `Regular volunteers: ${org.regularVolunteers?.trim() || 'not provided'}`,
  ];

  if (programs.length > 0) {
    lines.push('', 'Programs:');
    for (const p of programs) {
      const desc = p.description?.trim() ? `: ${p.description.trim()}` : '';
      const pop = p.targetPopulation?.trim() || '';
      const served = `(serves: ${pop})`;
      lines.push(
        `- ${p.name.trim()}${desc}${pop ? ' ' + served : ''}`
      );
    }
  }

  if (goals.selectedGoals.length > 0) {
    lines.push('', `Goals: ${goals.selectedGoals.join(', ')}`);
  }

  if (goals.additionalContext?.trim()) {
    lines.push('', `Additional context: ${goals.additionalContext.trim()}`);
  }

  return lines.join('\n').trim();
}

function buildGoalsContent(goals: {
  selectedGoals: string[];
  additionalContext: string;
}): string {
  const parts: string[] = [];

  if (goals.selectedGoals.length > 0) {
    parts.push(
      `Top priorities:\n${goals.selectedGoals
        .map((g) => `- ${g.replace(/_/g, ' ')}`)
        .join('\n')}`
    );
  }

  if (goals.additionalContext?.trim()) {
    parts.push(`Additional context:\n${goals.additionalContext.trim()}`);
  }

  return parts.join('\n\n');
}
