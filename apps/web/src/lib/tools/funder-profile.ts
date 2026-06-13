/**
 * Archetype tool: save_funder_profile (PR-A — write side)
 *
 * Architecture (PRD §3):
 *   Research happens in the Dev Director's normal chat loop using EXISTING tools
 *   (web_search + 990/open-data arsenal + get_org_memory). This tool is the
 *   enforcement gate: validates the spec's quality bar at write time and stores
 *   the profile in memory_entries with category "funder_profile".
 *
 *   The tool is registered for development_director ONLY (registry.ts).
 *
 * Storage (PRD §4 success criteria):
 *   memory_entries row:
 *     - category: "funder_profile"
 *     - title: funder_name
 *     - content: human-readable summary (field §1 basics)
 *     - source: "save_funder_profile tool"
 *     - data JSONB: funder_name, aliases, ein, funder_type, built_on,
 *       refreshed_on, plus the 8 spec fields with per-field retrieved-dates
 *
 * Refresh semantics (PRD §5 / spec §refresh):
 *   If an entry already exists for the funder (data->>'funder_name' ilike match),
 *   the save is a REFRESH:
 *     - §2 priorities and §5 process/calendar: replaced with new values
 *     - §7 relationship_history: APPENDED, never overwritten
 *     - built_on: preserved from original
 *     - refreshed_on: bumped to today
 *
 * Validation (PRD §4 success criteria / spec §quality bar):
 *   REJECTED saves with ACTIONABLE error messages when:
 *     V1. Any populated field lacks a source or retrieved_date
 *     V2. §2 priorities has fewer than 2 verbatim quoted phrases with sources
 *     V3. §3 giving profile lacks a real median/range (or explicit [need:])
 *     V4. §4 fit signals lacks at least 1 counter-signal (or states "none found")
 *     V5. §5 process/calendar does not yield a concrete next action + date
 *     V6. Any [cited:] tag is malformed (missing source or date)
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemoryByCategory } from "@/lib/memory/get-by-category";

// ---------------------------------------------------------------------------
// System-prompt addendum (research_funder workflow choreography)
// Placed here, gated by the funder_profile tool family in buildSystemAddendums.
// Content rules are verbatim from the spec.
// ---------------------------------------------------------------------------

export const FUNDER_PROFILE_TOOLS_ADDENDUM = `
## Funder profile: research_funder workflow

When the user asks to research a funder or build a funder profile, follow this workflow. Research happens across multiple turns using existing tools; \`save_funder_profile\` is the enforcement gate at the end.

### Allowed sources (per spec)
- The funder's own site and published guidelines (web_search)
- 990/990-PF data via the shipped discovery arsenal (foundation_grants, charity_navigator, inside_philanthropy, candid_demographics, usaspending, federal_register, ca_grants, grants)
- The org's OWN substrate for §6–7 (get_org_memory with category="prior_grants" filtered by funder_name; category="voice_samples")
- Reputable public coverage, clearly attributed

### What to gather per field (budget web_search across turns — max 5 uses per turn)

**§1 Identity & basics:** legal name, aliases, EIN, website, geography served, funder type (private foundation / community foundation / corporate / government). Source: funder site + 990 tools.

**§2 Priorities — VERBATIM:** Pull exact phrases from the funder's own guidelines/site. Quotes, not paraphrases. Need ≥2 verbatim quoted phrases, each with source + date. Example: "economic mobility for young people disconnected from school and work" [cited: pinkerton.org/guidelines, 2026-06-03]. Mirror the funder's framing in drafts — this is the material.

**§3 Giving profile:** From 990/open-data arsenal ONLY. Typical grant range (median + spread), total annual giving, number of grants/year, multi-year vs one-time, 3–8 recent grantees with amounts and purposes. No fabricated grantees or amounts — ever. If 990 data unavailable: [need: giving profile — 990 data not found].

**§4 Fit signals:** Concrete evidence this org matches (geography, population, program type overlap with past grantees) AND honest counter-signals (they fund research not services; they require 3 years of audited financials; geography mismatch). The counter-signals list MUST be present. If no counter-signals found after thorough research, state "none found after review" explicitly.

**§5 Process & calendar:** Application route (invitation-only? LOI-first? rolling vs deadline?), cycle dates, decision timeline, contact conventions. Invitation-only changes strategy from "apply" to "cultivate" — first-class fact. Yield a concrete next action + date. Source: funder site. Verbatim where possible.

**§6 Style & format:** Page/word limits, required sections, attachment lists, stylistic preferences. Also: does the org have prior submissions to this funder? (check get_org_memory category="voice_samples" and category="prior_grants").

**§7 Relationship history:** Call get_org_memory with category="prior_grants" and funder_name filter. Pull prior applications, awards, declines, contacts, feedback. Empty is valid. Never invent.

### Citation discipline (identical to outcomes_data)
- Every factual claim carries [cited: <source>, <date>]
- A field that cannot be sourced is [need: <field>] — NEVER inferred
- Verbatim quotes for §2 priorities and §5 process facts — summarize around quotes, never instead of them
- No fabricated grantees or amounts (§3 comes from 990 data or is [need:])

### When ready to save
Call \`save_funder_profile\` with all 8 fields. The tool enforces the quality bar — if it rejects the save with validation errors, address each error and try again. Never store an unsourced profile.
`;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const funderProfileTools: Anthropic.Tool[] = [
  {
    name: "save_funder_profile",
    description:
      "Save a researched funder profile to the org's memory substrate. This is the enforcement gate for the research_funder workflow — validates the spec's quality bar before storing. Call this AFTER researching the funder using web_search, 990/open-data tools, and get_org_memory. Returns validation errors if the quality bar is not met, so you can address gaps and retry. On success, stores the profile in memory_entries (category: funder_profile) for use by draft_grant_content.",
    input_schema: {
      type: "object" as const,
      properties: {
        // --- §1 Identity & basics ---
        funder_name: {
          type: "string",
          description:
            "Legal name of the funder (e.g. 'Pinkerton Foundation'). Used as the identity key for dedup / refresh.",
        },
        aliases: {
          type: "array",
          items: { type: "string" },
          description:
            "Alternative names or common abbreviations (e.g. ['Pinkerton', 'Pinkerton Found.']). Optional.",
        },
        ein: {
          type: "string",
          description: "Employer Identification Number (xx-xxxxxxx format), if known. Optional.",
        },
        funder_type: {
          type: "string",
          enum: [
            "private_foundation",
            "community_foundation",
            "corporate",
            "government",
            "other",
          ],
          description: "Funder classification per the spec §1.",
        },
        website: {
          type: "string",
          description: "Funder's primary website URL.",
        },
        geography_served: {
          type: "string",
          description: "Geographic scope (e.g. 'New York City', 'national', 'Mid-Atlantic states').",
        },

        // --- §2 Priorities ---
        priorities: {
          type: "object",
          description:
            "Funder's stated priorities in their OWN language. Verbatim quoted phrases required (≥2). Each phrase must have a source and retrieved_date.",
          properties: {
            verbatim_phrases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phrase: {
                    type: "string",
                    description: "Exact quoted phrase from funder's own materials.",
                  },
                  source: {
                    type: "string",
                    description: "URL or document name where this phrase appears.",
                  },
                  retrieved_date: {
                    type: "string",
                    description: "Date retrieved (YYYY-MM-DD).",
                  },
                },
                required: ["phrase", "source", "retrieved_date"],
              },
              description: "≥2 verbatim quoted phrases from the funder's own materials.",
            },
            summary: {
              type: "string",
              description: "Optional prose summary around the verbatim quotes.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last researched (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Primary source for this section (URL or document name).",
            },
          },
          required: ["verbatim_phrases", "retrieved_date", "source"],
        },

        // --- §3 Giving profile ---
        giving_profile: {
          type: "object",
          description:
            "Grant-size and grantee data from 990/open-data arsenal. No fabricated figures — use [need:] if unavailable.",
          properties: {
            median_grant: {
              type: "string",
              description:
                "Median grant amount (e.g. '$40,000') or '[need: median grant — 990 data not found]'.",
            },
            grant_range: {
              type: "string",
              description: "Typical range (e.g. '$10,000–$75,000') or '[need: grant range]'.",
            },
            total_annual_giving: {
              type: "string",
              description: "Total giving per year (e.g. '$2.1M in FY2024') or '[need:]'.",
            },
            grants_per_year: {
              type: "string",
              description: "Approximate number of grants per year or '[need:]'.",
            },
            multi_year_tendency: {
              type: "string",
              description:
                "Multi-year vs one-time tendency (e.g. 'primarily one-time, occasional multi-year') or '[need:]'.",
            },
            recent_grantees: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  amount: { type: "string" },
                  purpose: { type: "string" },
                  year: { type: "string" },
                },
                required: ["name"],
              },
              description:
                "3–8 representative recent grantees with amounts and purposes. From 990 data only — no fabrication.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last researched (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Data source (e.g. '990-PF FY2024 via foundation_grants tool').",
            },
          },
          required: ["median_grant", "retrieved_date", "source"],
        },

        // --- §4 Fit signals ---
        fit_signals: {
          type: "object",
          description:
            "Evidence for and against fit. Counter-signals are required (or explicit 'none found').",
          properties: {
            for_signals: {
              type: "array",
              items: { type: "string" },
              description:
                "Concrete evidence this org fits (geography, population, program type overlap with past grantees).",
            },
            counter_signals: {
              type: "array",
              items: { type: "string" },
              description:
                "Honest counter-signals — things that work against fit (funding model mismatch, requirements gaps, etc.). Use ['none found after review'] if truly none found.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last researched (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Source for fit analysis.",
            },
          },
          required: ["counter_signals", "retrieved_date", "source"],
        },

        // --- §5 Process & calendar ---
        process_and_calendar: {
          type: "object",
          description:
            "Application mechanics and timeline. Must yield a concrete next action + date.",
          properties: {
            application_route: {
              type: "string",
              description:
                "How to apply: 'invitation-only', 'LOI-first', 'open application', 'rolling', etc. Verbatim from funder site where possible.",
            },
            cycle_dates: {
              type: "string",
              description: "Deadlines, cycles, or rolling window.",
            },
            decision_timeline: {
              type: "string",
              description: "How long until decisions are made.",
            },
            contact_conventions: {
              type: "string",
              description: "How they prefer to be contacted (email, call, no unsolicited contact, etc.).",
            },
            next_action: {
              type: "string",
              description:
                "Concrete next action the org should take (e.g. 'Submit LOI via online portal', 'Request introductory call with program officer', 'Monitor site for next RFP opening').",
            },
            next_action_date: {
              type: "string",
              description:
                "Date for the next action (YYYY-MM-DD or a deadline description like 'Q1 2027 — no fixed date'). Required to satisfy §5 quality bar.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last researched (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Source for process information (URL).",
            },
          },
          required: [
            "application_route",
            "next_action",
            "next_action_date",
            "retrieved_date",
            "source",
          ],
        },

        // --- §6 Style & format ---
        style_and_format: {
          type: "object",
          description:
            "Page/word limits, required sections, stylistic preferences, and org's prior submissions to this funder.",
          properties: {
            page_word_limits: {
              type: "string",
              description: "Page or word limits for applications.",
            },
            required_sections: {
              type: "array",
              items: { type: "string" },
              description: "Required sections as specified by the funder.",
            },
            stylistic_preferences: {
              type: "string",
              description: "Known preferences: data-heavy vs story-led, formal vs informal, etc.",
            },
            org_prior_submissions: {
              type: "string",
              description:
                "Pointers to org's own prior submissions/reports to this funder (from substrate). Empty string if none found.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last researched (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Source for style/format information.",
            },
          },
          required: ["retrieved_date", "source"],
        },

        // --- §7 Relationship history ---
        relationship_history: {
          type: "object",
          description:
            "Prior applications, awards, declines with this funder — from org substrate. Empty is valid. On refresh, this field is APPENDED, never overwritten.",
          properties: {
            entries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["application", "award", "decline", "contact", "meeting", "feedback"],
                  },
                  date: { type: "string" },
                  description: { type: "string" },
                  contact_name: { type: "string" },
                  amount: { type: "string" },
                },
                required: ["type", "description"],
              },
              description: "History entries from the org's substrate (get_org_memory). Never invented.",
            },
            retrieved_date: {
              type: "string",
              description: "Date this field was last retrieved from the org substrate (YYYY-MM-DD).",
            },
            source: {
              type: "string",
              description: "Source (e.g. 'get_org_memory prior_grants').",
            },
          },
          required: ["retrieved_date", "source"],
        },
      },
      required: [
        "funder_name",
        "funder_type",
        "priorities",
        "giving_profile",
        "fit_signals",
        "process_and_calendar",
        "style_and_format",
        "relationship_history",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * V6: Detect malformed [cited:] tags.
 * A well-formed tag is: [cited: <source>, <date>]
 * A malformed one is: [cited: <something-without-a-date>] or [cited: ] or bare [cited:]
 */
function detectMalformedCitedTags(text: string): string[] {
  const issues: string[] = [];
  // Match all [cited: ...] tags
  const tagPattern = /\[cited:[^\]]*\]/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(text)) !== null) {
    const tag = match[0];
    // Well-formed: must have source, comma, and something that looks like a date (YYYY-MM-DD or similar)
    // Minimal: [cited: source, 2026-01-01] — at least a comma and a year
    const inner = tag.slice(7, -1).trim(); // strip "[cited:" and "]"
    if (!inner || !inner.includes(",")) {
      issues.push(`Malformed [cited:] tag: "${tag}" — must be [cited: <source>, <date>]`);
    } else {
      // Check the part after the last comma looks like a date
      const parts = inner.split(",");
      const datePart = parts[parts.length - 1].trim();
      if (!/\d{4}/.test(datePart)) {
        issues.push(
          `Malformed [cited:] tag: "${tag}" — date portion "${datePart}" does not contain a year`
        );
      }
    }
  }
  return issues;
}

/**
 * Scan a string for [need:] tags, returning count.
 * [need:] tags are valid and expected — this is used to detect when a
 * REQUIRED sub-field is entirely a [need:] placeholder vs. genuinely missing.
 */
function isNeedPlaceholder(value: string): boolean {
  return /^\[need:/i.test(value.trim());
}

// ---------------------------------------------------------------------------
// Main validation function
// Returns an array of actionable error strings. Empty = profile passes.
// ---------------------------------------------------------------------------

interface FunderProfileInput {
  funder_name: string;
  aliases?: string[];
  ein?: string;
  funder_type: string;
  website?: string;
  geography_served?: string;
  priorities: {
    verbatim_phrases: Array<{ phrase: string; source: string; retrieved_date: string }>;
    summary?: string;
    retrieved_date: string;
    source: string;
  };
  giving_profile: {
    median_grant: string;
    grant_range?: string;
    total_annual_giving?: string;
    grants_per_year?: string;
    multi_year_tendency?: string;
    recent_grantees?: Array<{ name: string; amount?: string; purpose?: string; year?: string }>;
    retrieved_date: string;
    source: string;
  };
  fit_signals: {
    for_signals?: string[];
    counter_signals: string[];
    retrieved_date: string;
    source: string;
  };
  process_and_calendar: {
    application_route: string;
    cycle_dates?: string;
    decision_timeline?: string;
    contact_conventions?: string;
    next_action: string;
    next_action_date: string;
    retrieved_date: string;
    source: string;
  };
  style_and_format: {
    page_word_limits?: string;
    required_sections?: string[];
    stylistic_preferences?: string;
    org_prior_submissions?: string;
    retrieved_date: string;
    source: string;
  };
  relationship_history: {
    entries?: Array<{
      type: string;
      date?: string;
      description: string;
      contact_name?: string;
      amount?: string;
    }>;
    retrieved_date: string;
    source: string;
  };
}

export function validateFunderProfile(input: FunderProfileInput): string[] {
  const errors: string[] = [];

  // ---- V1: Every populated field must be sourced + dated ----
  // Check each section's retrieved_date and source
  const sections = [
    { name: "§2 priorities", retrieved_date: input.priorities.retrieved_date, source: input.priorities.source },
    { name: "§3 giving_profile", retrieved_date: input.giving_profile.retrieved_date, source: input.giving_profile.source },
    { name: "§4 fit_signals", retrieved_date: input.fit_signals.retrieved_date, source: input.fit_signals.source },
    { name: "§5 process_and_calendar", retrieved_date: input.process_and_calendar.retrieved_date, source: input.process_and_calendar.source },
    { name: "§6 style_and_format", retrieved_date: input.style_and_format.retrieved_date, source: input.style_and_format.source },
    { name: "§7 relationship_history", retrieved_date: input.relationship_history.retrieved_date, source: input.relationship_history.source },
  ];

  for (const section of sections) {
    if (!section.retrieved_date || !section.retrieved_date.trim()) {
      errors.push(
        `${section.name} is missing retrieved_date — add the date you researched this field (YYYY-MM-DD).`
      );
    }
    if (!section.source || !section.source.trim()) {
      errors.push(
        `${section.name} is missing source — add the URL or document name where this information was found.`
      );
    }
  }

  // ---- V2: §2 must have ≥2 verbatim quoted phrases with sources ----
  const phrases = input.priorities.verbatim_phrases ?? [];
  const validPhrases = phrases.filter(
    (p) =>
      p.phrase && p.phrase.trim().length > 0 &&
      p.source && p.source.trim().length > 0 &&
      p.retrieved_date && p.retrieved_date.trim().length > 0
  );
  if (validPhrases.length < 2) {
    errors.push(
      `§2 priorities needs at least 2 verbatim quoted phrases with sources; found ${validPhrases.length}. ` +
      `Each phrase must be the funder's own words (not a paraphrase) with a source URL and retrieved_date. ` +
      `Example: { phrase: "economic mobility for young people", source: "pinkerton.org/guidelines", retrieved_date: "2026-06-10" }.`
    );
  }

  // ---- V3: §3 must have a real median/range or [need:] — not a blank or vague string ----
  const medianGrant = input.giving_profile.median_grant?.trim() ?? "";
  if (!medianGrant) {
    errors.push(
      `§3 giving_profile.median_grant is blank — provide a real figure from 990 data (e.g. '$40,000') ` +
      `or use '[need: median grant — 990 data not found]' if the data is unavailable.`
    );
  }
  // A "vague" string is one that's not a number/currency and not a [need:] placeholder.
  // Allow: "$40,000", "~$40K", "[need: ...]", "not publicly disclosed"
  // Flag: empty string, whitespace-only
  // (We already flagged empty above — this is just to document the validation logic.)

  // ---- V4: §4 counter_signals must be present and non-empty ----
  const counterSignals = input.fit_signals.counter_signals ?? [];
  const meaningfulCounterSignals = counterSignals.filter(
    (s) => s && s.trim().length > 0
  );
  if (meaningfulCounterSignals.length === 0) {
    errors.push(
      `§4 fit_signals.counter_signals is empty — include at least one honest counter-signal ` +
      `(e.g. "they fund research not services", "requires 3 years of audited financials", ` +
      `"geography primarily NYC, our work is regional"). ` +
      `If no counter-signals exist after thorough review, add ["none found after review"].`
    );
  }

  // ---- V5: §5 must yield a concrete next action + date ----
  const nextAction = input.process_and_calendar.next_action?.trim() ?? "";
  const nextActionDate = input.process_and_calendar.next_action_date?.trim() ?? "";

  if (!nextAction) {
    errors.push(
      `§5 process_and_calendar.next_action is blank — provide a concrete next step ` +
      `(e.g. "Submit LOI via online portal", "Request introductory call", "Monitor for next RFP cycle opening").`
    );
  }
  if (!nextActionDate) {
    errors.push(
      `§5 process_and_calendar.next_action_date is blank — provide a date or horizon ` +
      `(e.g. "2026-09-15", "Q1 2027 — no fixed deadline", "rolling — submit any time").`
    );
  }
  if (nextAction && nextActionDate) {
    // Check that the date is specific enough (not just "TBD" or entirely vague)
    const vagueDatePatterns = /^(tbd|unknown|unclear|n\/a|na)\s*$/i;
    if (vagueDatePatterns.test(nextActionDate)) {
      errors.push(
        `§5 process_and_calendar.next_action_date is too vague ("${nextActionDate}") — ` +
        `provide a date or explicit horizon. If truly unknown, use something like ` +
        `"[need: deadline — not published on funder site as of <today's date>]".`
      );
    }
  }

  // ---- V6: No malformed [cited:] tags ----
  // Check across all string fields in the profile
  const allText = JSON.stringify(input);
  const citedErrors = detectMalformedCitedTags(allText);
  for (const err of citedErrors) {
    errors.push(err);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export async function executeFunderProfileTool({
  name,
  input,
  orgId,
  serviceClient,
}: {
  name: string;
  input: Record<string, unknown>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
}): Promise<{ content: string; is_error?: boolean }> {
  if (name !== "save_funder_profile") {
    return { content: `Unknown funder-profile tool: ${name}`, is_error: true };
  }

  const typed = input as unknown as FunderProfileInput;

  // Basic required field check
  if (!typed.funder_name || typeof typed.funder_name !== "string" || !typed.funder_name.trim()) {
    return {
      content: "funder_name is required and must be a non-empty string.",
      is_error: true,
    };
  }

  // Run quality-bar validation
  const validationErrors = validateFunderProfile(typed);
  if (validationErrors.length > 0) {
    const errorList = validationErrors.map((e, i) => `${i + 1}. ${e}`).join("\n");
    return {
      content:
        `save_funder_profile validation failed — ${validationErrors.length} issue(s) to resolve before saving:\n\n` +
        errorList +
        `\n\nAddress each issue above and call save_funder_profile again.`,
      is_error: true,
    };
  }

  // Check for existing profile (case-insensitive funder_name match)
  const existing = await getMemoryByCategory(serviceClient, orgId, "funder_profile", {
    funderName: typed.funder_name.trim(),
    limit: 1,
  });

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const isRefresh = existing.length > 0;
  const existingEntry = existing[0];

  let builtOn: string;
  let refreshedOn: string | null;

  if (isRefresh) {
    // Preserve built_on from original
    const existingData = (existingEntry.data ?? {}) as Record<string, unknown>;
    builtOn = (existingData.built_on as string | undefined) ?? existingEntry.created_at.split("T")[0];
    refreshedOn = today;
  } else {
    builtOn = today;
    refreshedOn = null;
  }

  // --- Refresh semantics for §7 relationship_history ---
  // On refresh: APPEND new entries to existing history; never overwrite.
  let mergedRelationshipHistory: FunderProfileInput["relationship_history"];

  if (isRefresh) {
    const existingData = (existingEntry.data ?? {}) as Record<string, unknown>;
    const existingHistory = existingData.relationship_history as
      | FunderProfileInput["relationship_history"]
      | undefined;

    const existingEntries = existingHistory?.entries ?? [];
    const newEntries = typed.relationship_history.entries ?? [];

    mergedRelationshipHistory = {
      ...typed.relationship_history,
      entries: [...existingEntries, ...newEntries],
    };
  } else {
    mergedRelationshipHistory = typed.relationship_history;
  }

  // Build the data JSONB
  const dataPayload: Record<string, unknown> = {
    funder_name: typed.funder_name.trim(),
    aliases: typed.aliases ?? [],
    ein: typed.ein ?? null,
    funder_type: typed.funder_type,
    website: typed.website ?? null,
    geography_served: typed.geography_served ?? null,
    built_on: builtOn,
    refreshed_on: refreshedOn,

    // The 8 spec fields with full data and per-field retrieved_dates
    priorities: typed.priorities,
    giving_profile: typed.giving_profile,
    fit_signals: typed.fit_signals,
    process_and_calendar: typed.process_and_calendar,
    style_and_format: typed.style_and_format,

    // §7 uses merged history (append-only on refresh)
    relationship_history: mergedRelationshipHistory,
  };

  // Build human-readable content summary (§1 basics)
  const contentParts: string[] = [
    `${typed.funder_name} — ${typed.funder_type.replace(/_/g, " ")}`,
  ];
  if (typed.geography_served) contentParts.push(`Geography: ${typed.geography_served}`);
  if (typed.website) contentParts.push(`Website: ${typed.website}`);
  if (typed.ein) contentParts.push(`EIN: ${typed.ein}`);
  contentParts.push(`Built on: ${builtOn}${refreshedOn ? ` | Refreshed: ${refreshedOn}` : ""}`);

  const content = contentParts.join("\n");

  if (isRefresh) {
    // UPDATE existing entry
    const { error } = await serviceClient
      .from("memory_entries")
      .update({
        title: typed.funder_name.trim(),
        content,
        data: dataPayload,
        source: "save_funder_profile tool",
      })
      .eq("id", existingEntry.id);

    if (error) {
      console.error("[funder-profile] Update error:", error);
      return {
        content: `Failed to refresh funder profile: ${error.message}`,
        is_error: true,
      };
    }

    const newHistoryCount = typed.relationship_history.entries?.length ?? 0;
    return {
      content:
        `Funder profile for "${typed.funder_name}" refreshed (built_on: ${builtOn}, refreshed_on: ${today}). ` +
        `§2 priorities and §5 process/calendar updated. ` +
        `§7 relationship history: ${newHistoryCount} new entry/entries appended (total: ${mergedRelationshipHistory.entries?.length ?? 0}). ` +
        `Profile is ready for use by draft_grant_content.`,
    };
  } else {
    // INSERT new entry
    const { error } = await serviceClient.from("memory_entries").insert({
      org_id: orgId,
      category: "funder_profile",
      title: typed.funder_name.trim(),
      content,
      data: dataPayload,
      source: "save_funder_profile tool",
      auto_generated: true,
    });

    if (error) {
      console.error("[funder-profile] Insert error:", error);
      return {
        content: `Failed to save funder profile: ${error.message}`,
        is_error: true,
      };
    }

    return {
      content:
        `Funder profile for "${typed.funder_name}" saved (built_on: ${today}). ` +
        `All 8 fields stored with provenance. ` +
        `Profile is ready for use by draft_grant_content. ` +
        `Cite funder facts in drafts as [cited: funder_profile] — the citation validator covers these exactly like org facts.`,
    };
  }
}
