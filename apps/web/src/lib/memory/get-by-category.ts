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
