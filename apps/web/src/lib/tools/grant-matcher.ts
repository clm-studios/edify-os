/**
 * Anthropic tool definition + executor for the `search_grants` meta-tool.
 *
 * One tool: search_grants — the headline differentiation feature for the
 * Dev Director. Aggregates from the wired-in grant/funder sources, applies
 * hard filters, then asks Sonnet to rank against the org profile and return
 * a top-12 with explainable citations.
 *
 * Architecture (PRD-search-grants-consolidation-2026-05-13, Option A —
 * single meta-tool, clean rename):
 *   - One user-visible call replaces 10 previously top-level grant-source
 *     tool families on the Dev Director's array. Internal dispatch fans out
 *     to the same source helpers via lib/grant-matcher.ts.
 *   - Optional `sources` array narrows the fan-out for "search just CA
 *     Grants" / "just Federal Register" intents that used to go through the
 *     individual source tools.
 *   - Internal Sonnet judge call uses prompt caching on the org-profile
 *     preamble — keeps the per-match cost sub-dollar across repeated runs
 *     for the same org.
 *   - Citations cannot be fabricated: the executor projects ranked rows
 *     back from the real candidate pool.
 *
 * Why this consolidates: pre-Sprint-α.5, Dev Director had 10 grant-related
 * tool families spread top-level (~40-60 individual tool defs). Past
 * Anthropic's ~20-tool readability ceiling, the model picked near-but-wrong
 * tools and burned tokens on the inflated tool array. This tool is the
 * single entry point; the source helpers stay in their files for backward
 * compat but no longer ship in archetype tool arrays.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findGrantsForOrg,
  type MatcherOrgProfile,
  type MatcherOptions,
  type GrantSourceSlug,
} from "@/lib/grant-matcher";

// ---------------------------------------------------------------------------
// System-prompt addendum.
// ---------------------------------------------------------------------------

export const SEARCH_GRANTS_TOOLS_ADDENDUM = `\nYou have access to search_grants — the grant-matching engine. This is the recommended tool when the user asks "what grants should we apply for?", "find grants for our org", "what funders match us?", or any open-ended prospecting question. It chains the wired-in grant/funder data sources (Grants.gov, CA Grants Portal, Federal Register, foundation grant histories), scores candidates against the org's mission/geography/programs, and returns a ranked top 12 with citation URLs. Pass refinements via the optional fields (keyword, sources, geography, due_within_days, min_amount, max_amount, foundation_eins) when the user gives you cues — otherwise the tool reads the org profile directly. Use the sources array to scope a search to specific catalogs (e.g. sources: ["ca_grants"] for a California-only sweep, sources: ["federal_register"] for new NOFOs). The tool returns structured JSON with each match's source, deadline, amount, match_score (0-100), why_match (1-2 sentence explanation), and citation_url. NEVER fabricate matches: if the tool returns an empty list, surface that politely (the candidate pool was empty after hard filters) — do NOT invent grants. ALWAYS surface the citation_url for each match in your reply so the user can verify against the source.`;

// Source slugs accepted by the `sources` input array. Mirrors the engine's
// GrantSourceSlug union — keep these in sync. Five of the nine are not yet
// wired into the engine (propublica, usaspending, charity_navigator,
// candid_demographics, inside_philanthropy); they're listed here because
// PRD F1 fixed the schema as a stable public contract, and silently no-op
// in the engine until wiring lands.
const SEARCH_GRANTS_SOURCE_ENUM: GrantSourceSlug[] = [
  "grants_gov",
  "ca_grants",
  "federal_register",
  "foundation_grants",
  "propublica",
  "usaspending",
  "charity_navigator",
  "candid_demographics",
  "inside_philanthropy",
];

// Module-level set used by the executor to filter incoming input.sources.
// Hoisted so we don't rebuild it on every tool call.
const VALID_SOURCE_SLUGS = new Set<GrantSourceSlug>(SEARCH_GRANTS_SOURCE_ENUM);

// ---------------------------------------------------------------------------
// Tool definition (model-facing).
// ---------------------------------------------------------------------------

export const searchGrantsTools: Anthropic.Tool[] = [
  {
    name: "search_grants",
    description:
      "Search for grants the org might be eligible for. Aggregates federal/state/foundation sources (Grants.gov, CA Grants Portal, Federal Register, foundation grant histories), applies deadline/amount/eligibility filters, then ranks survivors against the org's mission and programs using Claude. Returns a top-12 with title, source, amount, deadline (ISO or null), match_score (0-100), why_match (cites the specific org attribute the grant aligns with), and citation_url (real source URL). Optionally narrow by source(s) via the sources array, or filter by keyword/amount/deadline. No fabrication: an empty match list means the candidate pool was empty after filters.",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description:
            "Optional keyword or topic to search (e.g. 'youth mentoring', 'community health'). When omitted, the org's focus_area or mission is used.",
        },
        sources: {
          type: "array",
          description:
            "Optional. Narrow the search to specific sources. Default: all 9. Use this when the user asks for a single-catalog search (e.g. ['ca_grants'] for California-only, ['federal_register'] for new NOFOs).",
          items: {
            type: "string",
            enum: SEARCH_GRANTS_SOURCE_ENUM,
          },
        },
        focus_area: {
          type: "string",
          description:
            "Optional refinement of the org's cause area for better keyword matching (e.g. 'Youth Development', 'Community Health'). Ignored when keyword is provided.",
        },
        geography: {
          type: "string",
          description:
            "Optional geography override (e.g. 'Detroit, MI' or 'California statewide'). Triggers California-specific source inclusion when 'California' or 'CA' is detected.",
        },
        beneficiaries: {
          type: "string",
          description:
            "Optional free-text describing who the org serves (e.g. 'at-risk youth ages 12-18'). Improves ranking quality.",
        },
        annual_budget: {
          type: "string",
          description:
            "Optional annual operating budget hint (e.g. '$400K/year'). Helps the matcher reason about realistic award amounts.",
        },
        current_programs: {
          type: "array",
          description:
            "Optional list of running program names the org wants to fund. Bullet points the matcher reads when scoring relevance.",
          items: { type: "string" },
        },
        due_within_days: {
          type: "number",
          description:
            "Hard cap on how far in the future a deadline can be (defaults to 365). Use a smaller number for 'open in the next 60 days' style queries.",
        },
        min_amount: {
          type: "number",
          description:
            "Optional minimum award amount in USD. Drops grants whose ceiling is below this. Use when the user wants 'at least $50K' style filtering.",
        },
        max_amount: {
          type: "number",
          description:
            "Optional maximum award amount in USD. Drops grants whose floor is above this. Use when the user wants small-grant scope.",
        },
        eligibility: {
          type: "string",
          description:
            "Optional eligibility category code (e.g. 'nonprofits', 'small_businesses', 'state_governments'). Defaults to 'nonprofits' for the federal Grants.gov source.",
        },
        foundation_eins: {
          type: "array",
          description:
            "Optional list of foundation EINs the user wants peer-funding history pulled for. EXPENSIVE — each EIN is 3-10s of S3+parse latency, capped at 5. Only include when the user has shortlisted prospects (e.g. 'compare us against Ford and Hewlett's recent grantees').",
          items: { type: "string" },
        },
        top_n: {
          type: "number",
          description:
            "Cap on returned matches. Defaults to 12 (PRD-mandated). Lower for chat brevity, raise for comprehensive listings up to 25.",
        },
      },
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Executor.
// ---------------------------------------------------------------------------

interface OrgRow {
  name: string | null;
  mission: string | null;
}

export async function executeSearchGrantsTool({
  name,
  input,
  orgId,
  serviceClient,
  anthropic,
}: {
  name: string;
  input: Record<string, unknown>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
  anthropic: Anthropic;
}): Promise<{ content: string; is_error?: boolean }> {
  if (name !== "search_grants") {
    return {
      content: `Unknown search-grants tool: ${name}`,
      is_error: true,
    };
  }

  // Pull the org's name + mission. Required for the matcher's preamble.
  const { data, error } = await serviceClient
    .from("orgs")
    .select("name, mission")
    .eq("id", orgId)
    .single();
  if (error || !data) {
    return {
      content:
        "Could not load org profile for matching. Make sure your organization name and mission are filled in under Settings.",
      is_error: true,
    };
  }
  const orgRow = data as OrgRow;
  if (!orgRow.name || !orgRow.mission) {
    return {
      content:
        "Org profile is incomplete — both organization name and mission statement are required for grant matching. Update them under Settings → Organization and try again.",
      is_error: true,
    };
  }

  // Build the matcher profile from the org row + per-call refinements.
  const profile: MatcherOrgProfile = {
    orgName: orgRow.name,
    mission: orgRow.mission,
    geography: typeof input.geography === "string" ? input.geography : undefined,
    focusArea:
      typeof input.focus_area === "string" ? input.focus_area : undefined,
    annualBudget:
      typeof input.annual_budget === "string"
        ? input.annual_budget
        : undefined,
    beneficiaries:
      typeof input.beneficiaries === "string"
        ? input.beneficiaries
        : undefined,
    currentPrograms: Array.isArray(input.current_programs)
      ? input.current_programs.filter((p): p is string => typeof p === "string")
      : undefined,
    foundationEins: Array.isArray(input.foundation_eins)
      ? input.foundation_eins.filter((e): e is string => typeof e === "string")
      : undefined,
    eligibility:
      typeof input.eligibility === "string" ? input.eligibility : undefined,
  };

  // Filter input.sources to known slugs (defensive against malformed model
  // output — Anthropic enforces enum at the schema layer, but trust-but-verify).
  const sources = Array.isArray(input.sources)
    ? input.sources.filter(
        (s): s is GrantSourceSlug =>
          typeof s === "string" && VALID_SOURCE_SLUGS.has(s as GrantSourceSlug),
      )
    : undefined;

  const options: MatcherOptions = {
    deadlineWithinDays:
      typeof input.due_within_days === "number"
        ? input.due_within_days
        : undefined,
    minAmount:
      typeof input.min_amount === "number" ? input.min_amount : undefined,
    maxAmount:
      typeof input.max_amount === "number" ? input.max_amount : undefined,
    topN: typeof input.top_n === "number" ? input.top_n : undefined,
    sources: sources && sources.length > 0 ? sources : undefined,
    keyword: typeof input.keyword === "string" ? input.keyword : undefined,
  };

  try {
    const result = await findGrantsForOrg(profile, options, anthropic);
    return { content: JSON.stringify(result) };
  } catch (err) {
    console.error("[search-grants-tool] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Grant matching failed.";
    return {
      content: `Grant matching failed: ${msg}`,
      is_error: true,
    };
  }
}
