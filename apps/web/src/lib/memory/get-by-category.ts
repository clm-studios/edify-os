/**
 * Query helper for the typed proof library (Sprint A.5).
 *
 * `getMemoryByCategory` is the canonical server-side query path for typed
 * memory entries. It queries memory_entries by org_id + category and supports
 * optional JSONB field filters for structured lookups.
 *
 * Two consumption patterns (see PRD Section 5.3):
 *   A. System prompt injection — call before assembling the system prompt.
 *   B. Archetype tool (dynamic) — called via get_org_memory tool when the
 *      archetype needs specific data mid-conversation.
 *
 * This sprint ships Pattern B (tool). Pattern A can be layered on later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProofLibraryCategory = "outcomes" | "prior_grants" | "voice_samples";
export type AnyMemoryCategory =
  | ProofLibraryCategory
  | "mission"
  | "programs"
  | "donors"
  | "grants"
  | "campaigns"
  | "brand_voice"
  | "contacts"
  | "processes"
  | "general"
  | "financials"
  | "volunteers"
  | "events"
  | "org_profile"
  | (string & Record<never, never>); // allow arbitrary strings for forward compat

export interface MemoryEntryRow {
  id: string;
  org_id: string;
  category: string;
  title: string;
  content: string;
  data: Record<string, unknown> | null;
  source: string | null;
  auto_generated: boolean;
  created_at: string;
}

export interface MemoryQueryFilter {
  /** Filter by data->>'year' (integer) */
  year?: number;
  /** Filter by data->>'status' (string) — e.g. 'funded', 'declined' */
  status?: string;
  /** Filter by data->>'funder_name' (string, case-insensitive contains) */
  funderName?: string;
  /** Maximum number of rows to return (default 50) */
  limit?: number;
  /** Order by created_at: 'asc' | 'desc' (default 'desc') */
  order?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Query typed memory entries for an org by category and optional filters.
 *
 * @param serviceClient - Supabase service-role client
 * @param orgId         - Organization UUID
 * @param category      - Memory category to query
 * @param filter        - Optional field filters
 * @returns             - Matching memory_entries rows, ordered by created_at desc
 */
export async function getMemoryByCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  category: AnyMemoryCategory,
  filter: MemoryQueryFilter = {}
): Promise<MemoryEntryRow[]> {
  const { year, status, funderName, limit = 50, order = "desc" } = filter;

  let query = serviceClient
    .from("memory_entries")
    .select("id, org_id, category, title, content, data, source, auto_generated, created_at")
    .eq("org_id", orgId)
    .eq("category", category)
    .order("created_at", { ascending: order === "asc" })
    .limit(limit);

  // JSONB filter: data->>'year' = '<year>'
  // Supabase JS doesn't have native JSONB path filters in the select builder,
  // so we use `.filter()` with PostgREST syntax.
  if (year !== undefined) {
    query = query.filter("data->>year", "eq", String(year));
  }

  if (status !== undefined) {
    query = query.filter("data->>status", "eq", status);
  }

  if (funderName !== undefined) {
    // case-insensitive contains — PostgREST ilike operator
    query = query.filter("data->>funder_name", "ilike", `%${funderName}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[memory/get-by-category] Query error (org=${orgId}, cat=${category}):`, error);
    return [];
  }

  return (data ?? []) as MemoryEntryRow[];
}

// ---------------------------------------------------------------------------
// Convenience serializers for system-prompt injection (Pattern A, future use)
// ---------------------------------------------------------------------------

/**
 * Serialize prior_grants entries into a human-readable text block for
 * system prompt injection. Each entry is formatted as a bullet with key fields.
 */
export function serializePriorGrantsForPrompt(entries: MemoryEntryRow[]): string {
  if (entries.length === 0) return "No prior grant history on file.";
  const lines = entries.map((e) => {
    const d = e.data ?? {};
    const parts: string[] = [];
    if (d.funder_name) parts.push(`Funder: ${d.funder_name}`);
    if (d.year) parts.push(`Year: ${d.year}`);
    if (d.amount_awarded != null) parts.push(`Awarded: $${Number(d.amount_awarded).toLocaleString()}`);
    if (d.status) parts.push(`Status: ${d.status}`);
    if (d.grant_program) parts.push(`Program: ${d.grant_program}`);
    return `- ${e.title}\n  ${parts.join(" | ")}\n  ${e.content.substring(0, 200)}`;
  });
  return `Prior grants (${entries.length}):\n${lines.join("\n\n")}`;
}

/**
 * Serialize outcomes entries into a human-readable text block.
 */
export function serializeOutcomesForPrompt(entries: MemoryEntryRow[]): string {
  if (entries.length === 0) return "No quantitative outcomes on file.";
  const lines = entries.map((e) => {
    const d = e.data ?? {};
    const metric = d.metric_name ? `${d.value ?? "?"} ${d.unit ?? ""} ${d.metric_name}` : e.title;
    const program = d.program ? ` (${d.program})` : "";
    const year = d.year ? ` in ${d.year}` : "";
    return `- ${metric}${program}${year}`;
  });
  return `Impact outcomes (${entries.length}):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Funder profile serializer (PR-B — read path)
// ---------------------------------------------------------------------------

/**
 * Staleness check results for a funder profile entry.
 *
 * Per spec §8 / PRD §4:
 *   - Profile older than 6 months (built_on / refreshed_on) → profile stale
 *   - deadline/cycle fields (process_and_calendar.retrieved_date) older than
 *     90 days → deadline fields stale
 *
 * "today" is accepted as a parameter to make the logic purely testable
 * without mocking Date.now().
 */
export interface FunderProfileStalenessResult {
  profileStale: boolean;
  deadlineFieldsStale: boolean;
  profileAgeMs: number | null;
  deadlineAgeMs: number | null;
}

export function checkFunderProfileStaleness(
  data: Record<string, unknown>,
  today: Date = new Date()
): FunderProfileStalenessResult {
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000; // approx 6 months
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

  // Use refreshed_on if present, else built_on (spec: "flag at 6 months")
  const profileDateStr = (data.refreshed_on as string | null | undefined) ?? (data.built_on as string | undefined);
  let profileAgeMs: number | null = null;
  let profileStale = false;
  if (profileDateStr) {
    const profileDate = new Date(profileDateStr);
    if (!isNaN(profileDate.getTime())) {
      profileAgeMs = today.getTime() - profileDate.getTime();
      profileStale = profileAgeMs > SIX_MONTHS_MS;
    }
  }

  // Deadline/cycle staleness: process_and_calendar.retrieved_date (spec: "flag at 90 days")
  const processField = data.process_and_calendar as Record<string, unknown> | undefined;
  const deadlineDateStr = processField?.retrieved_date as string | undefined;
  let deadlineAgeMs: number | null = null;
  let deadlineFieldsStale = false;
  if (deadlineDateStr) {
    const deadlineDate = new Date(deadlineDateStr);
    if (!isNaN(deadlineDate.getTime())) {
      deadlineAgeMs = today.getTime() - deadlineDate.getTime();
      deadlineFieldsStale = deadlineAgeMs > NINETY_DAYS_MS;
    }
  }

  return { profileStale, deadlineFieldsStale, profileAgeMs, deadlineAgeMs };
}

/**
 * Serialize a funder_profile memory entry into a human-readable text block
 * for injection into the draft_grant_content section prompt (Block-2, uncached).
 *
 * Staleness warnings (spec §8 / PRD §4):
 *   - Profile older than 6 months → STALE warning header
 *   - deadline/cycle fields older than 90 days → STALE warning on process section
 *
 * Claims in the output cite [cited: funder_profile] so the existing citation
 * validator handles them identically to org-fact tags (spec §consumption).
 */
export function serializeFunderProfileForPrompt(entry: MemoryEntryRow, today?: Date): string {
  const d = entry.data ?? {};
  const staleness = checkFunderProfileStaleness(d, today);

  const lines: string[] = [];

  // --- Staleness header (opens the block if stale — spec requirement) ---
  const stalenessWarnings: string[] = [];
  if (staleness.profileStale) {
    const ageMonths = staleness.profileAgeMs !== null
      ? Math.round(staleness.profileAgeMs / (30 * 24 * 60 * 60 * 1000))
      : "unknown number of";
    stalenessWarnings.push(
      `⚠ STALE PROFILE: This funder profile is approximately ${ageMonths} months old (last updated: ${(d.refreshed_on as string | null) ?? (d.built_on as string) ?? "unknown"}). ` +
      `Key details (priorities, process, giving profile) may have changed. ` +
      `Surface this staleness to the user and recommend refreshing the profile with research_funder before finalizing the draft.`
    );
  }
  if (staleness.deadlineFieldsStale) {
    const ageDays = staleness.deadlineAgeMs !== null
      ? Math.round(staleness.deadlineAgeMs / (24 * 60 * 60 * 1000))
      : "unknown number of";
    stalenessWarnings.push(
      `⚠ STALE DEADLINE/CYCLE DATA: Process and calendar fields are approximately ${ageDays} days old. ` +
      `Deadline dates and application cycles should be verified before advising the user to submit.`
    );
  }

  if (stalenessWarnings.length > 0) {
    lines.push(stalenessWarnings.join("\n"));
    lines.push("");
  }

  // --- Block header ---
  const builtOn = (d.built_on as string | undefined) ?? "unknown";
  const refreshedOn = d.refreshed_on as string | null | undefined;
  const profileDate = refreshedOn ? `built ${builtOn}, last refreshed ${refreshedOn}` : `built ${builtOn}`;
  lines.push(`## Funder profile: ${entry.title} [cited: funder_profile] (${profileDate})`);

  // §1 Identity & basics
  const funderType = (d.funder_type as string | undefined)?.replace(/_/g, " ") ?? "";
  const parts: string[] = [];
  if (funderType) parts.push(funderType);
  if (d.geography_served) parts.push(`geography: ${d.geography_served as string}`);
  if (d.website) parts.push(`site: ${d.website as string}`);
  if (d.ein) parts.push(`EIN: ${d.ein as string}`);
  if (parts.length > 0) lines.push(`**Identity:** ${parts.join(" | ")} [cited: funder_profile]`);

  // §2 Priorities (verbatim phrases — the framing material for drafts)
  const priorities = d.priorities as Record<string, unknown> | undefined;
  if (priorities) {
    const phrases = priorities.verbatim_phrases as Array<{ phrase: string; source?: string; retrieved_date?: string }> | undefined;
    if (phrases && phrases.length > 0) {
      lines.push(`**§2 Priorities (funder's own language — mirror in draft framing):**`);
      for (const p of phrases) {
        const src = p.source ? ` [cited: ${p.source}, ${p.retrieved_date ?? "date unknown"}]` : " [cited: funder_profile]";
        lines.push(`  - "${p.phrase}"${src}`);
      }
      if (priorities.summary) {
        lines.push(`  Summary: ${priorities.summary as string}`);
      }
    }
  }

  // §3 Giving profile (calibrates ask size and approach)
  const giving = d.giving_profile as Record<string, unknown> | undefined;
  if (giving) {
    const givingParts: string[] = [];
    if (giving.median_grant) givingParts.push(`median grant: ${giving.median_grant as string}`);
    if (giving.grant_range) givingParts.push(`range: ${giving.grant_range as string}`);
    if (giving.total_annual_giving) givingParts.push(`total giving: ${giving.total_annual_giving as string}`);
    if (giving.grants_per_year) givingParts.push(`grants/year: ${giving.grants_per_year as string}`);
    if (giving.multi_year_tendency) givingParts.push(`multi-year tendency: ${giving.multi_year_tendency as string}`);
    if (givingParts.length > 0) {
      lines.push(`**§3 Giving profile:** ${givingParts.join(" | ")} [cited: funder_profile]`);
    }
    const grantees = giving.recent_grantees as Array<{ name: string; amount?: string; purpose?: string; year?: string }> | undefined;
    if (grantees && grantees.length > 0) {
      const granteeStr = grantees.slice(0, 5).map((g) => {
        const detail = [g.amount, g.purpose, g.year].filter(Boolean).join(", ");
        return detail ? `${g.name} (${detail})` : g.name;
      }).join("; ");
      lines.push(`  Recent grantees: ${granteeStr} [cited: funder_profile]`);
    }
  }

  // §4 Fit signals (lead with overlaps, address counter-signals)
  const fit = d.fit_signals as Record<string, unknown> | undefined;
  if (fit) {
    const forSignals = fit.for_signals as string[] | undefined;
    const counterSignals = fit.counter_signals as string[] | undefined;
    if (forSignals && forSignals.length > 0) {
      lines.push(`**§4 Fit — FOR this org:** ${forSignals.join("; ")} [cited: funder_profile]`);
    }
    if (counterSignals && counterSignals.length > 0) {
      lines.push(`**§4 Fit — COUNTER-SIGNALS (address in draft):** ${counterSignals.join("; ")} [cited: funder_profile]`);
    }
  }

  // §5 Process & calendar (constrains strategy)
  const process = d.process_and_calendar as Record<string, unknown> | undefined;
  if (process) {
    const processParts: string[] = [];
    if (process.application_route) processParts.push(`route: ${process.application_route as string}`);
    if (process.cycle_dates) processParts.push(`cycles: ${process.cycle_dates as string}`);
    if (process.decision_timeline) processParts.push(`decisions: ${process.decision_timeline as string}`);

    // Stale deadline warning inline on the process section
    const deadlineStaleNote = staleness.deadlineFieldsStale ? " ⚠ VERIFY BEFORE ADVISING — deadline data may be outdated" : "";

    if (processParts.length > 0) {
      lines.push(`**§5 Process:** ${processParts.join(" | ")} [cited: funder_profile]${deadlineStaleNote}`);
    }
    if (process.next_action && process.next_action_date) {
      lines.push(`  Next action: ${process.next_action as string} by ${process.next_action_date as string} [cited: funder_profile]${deadlineStaleNote}`);
    }
  }

  // §6 Style & format (constrains structure/length)
  const style = d.style_and_format as Record<string, unknown> | undefined;
  if (style) {
    const styleParts: string[] = [];
    if (style.page_word_limits) styleParts.push(`limits: ${style.page_word_limits as string}`);
    if (style.stylistic_preferences) styleParts.push(`style: ${style.stylistic_preferences as string}`);
    const sections = style.required_sections as string[] | undefined;
    if (sections && sections.length > 0) styleParts.push(`required sections: ${sections.join(", ")}`);
    if (styleParts.length > 0) {
      lines.push(`**§6 Format:** ${styleParts.join(" | ")} [cited: funder_profile]`);
    }
    if (style.org_prior_submissions && (style.org_prior_submissions as string).trim()) {
      lines.push(`  Org's prior submissions to this funder: ${style.org_prior_submissions as string} [cited: funder_profile]`);
    }
  }

  // §7 Relationship history (adjusts register: first approach vs known relationship)
  const relHistory = d.relationship_history as Record<string, unknown> | undefined;
  const relEntries = relHistory?.entries as Array<{ type: string; date?: string; description: string }> | undefined;
  if (relEntries && relEntries.length > 0) {
    const relStr = relEntries.slice(0, 5).map((r) => {
      const date = r.date ? ` (${r.date})` : "";
      return `${r.type}${date}: ${r.description}`;
    }).join("; ");
    lines.push(`**§7 Relationship history:** ${relStr} [cited: funder_profile]`);
  } else {
    lines.push(`**§7 Relationship history:** No prior interactions on record — treat as first approach. [cited: funder_profile]`);
  }

  // Instruction block to the model on how to use this profile
  lines.push(`\n**How to use this profile:** §2 phrases should appear in your framing vocabulary. §3 calibrates the ask and approach. §4 counter-signals must be addressed or acknowledged in the draft. §5 constrains the strategy (check for invitation-only). §6 constrains structure/length. §7 sets register. All claims sourced from this profile cite [cited: funder_profile].`);

  return lines.join("\n");
}
