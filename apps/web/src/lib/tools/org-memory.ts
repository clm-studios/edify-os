/**
 * Archetype tool: get_org_memory (Sprint A.5)
 *
 * Exposes the typed proof library to archetypes via a tool call. The archetype
 * can ask for structured memory by category and optional filters (year, status,
 * funder name) and receive a structured JSON response.
 *
 * Scope (OQ-3 resolved — narrow for MVP):
 *   - Development Director: prior_grants, outcomes, voice_samples
 *   - Programs Director: outcomes, voice_samples
 *   - Executive Assistant + Events Director: fast-follow (not this sprint)
 *
 * Pattern: the tool uses the same `getMemoryByCategory` query helper used
 * by the system-prompt injection pattern (Section 5.3, Pattern B).
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemoryByCategory } from "@/lib/memory/get-by-category";
import { PROOF_LIBRARY_CATEGORIES } from "@/lib/proof-library/extract";

// ---------------------------------------------------------------------------
// System-prompt addendum
// ---------------------------------------------------------------------------

export const ORG_MEMORY_TOOLS_ADDENDUM = `\n## Organizational proof library
You have access to the org's typed proof library via \`get_org_memory\`. Use it when:
- Drafting grant applications (call with category="prior_grants" to see funding history)
- Writing impact sections (call with category="outcomes" for quantitative data)
- Matching org voice/tone (call with category="voice_samples" for communication samples)
Always prefer citing actual data from the proof library over generic language. If the library is empty, say so honestly and suggest uploading relevant documents.`;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const orgMemoryTools: Anthropic.Tool[] = [
  {
    name: "get_org_memory",
    description:
      "Retrieve structured organizational memory from the proof library. Use to look up prior grants, impact outcomes, and voice samples before drafting grant applications, impact reports, or communications. Returns typed entries with structured data fields (funder, year, amounts, metrics, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["prior_grants", "outcomes", "voice_samples"],
          description:
            "Category to retrieve. 'prior_grants' = funding history (funder, year, amount, status). 'outcomes' = quantitative impact data (students served, graduation rates, etc.). 'voice_samples' = representative communication samples for tone matching.",
        },
        year: {
          type: "number",
          description: "Filter by year (e.g. 2024). Optional.",
        },
        status: {
          type: "string",
          enum: ["funded", "declined", "pending", "partial", "unknown"],
          description: "Filter prior_grants by status. Optional.",
        },
        funder_name: {
          type: "string",
          description:
            "Filter prior_grants by funder name (partial match, case-insensitive). Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of entries to return (default 20, max 50).",
        },
      },
      required: ["category"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export async function executeOrgMemoryTool({
  name,
  input,
  orgId,
  serviceClient,
}: {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, unknown>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
}): Promise<{ content: string; is_error?: boolean }> {
  if (name !== "get_org_memory") {
    return { content: `Unknown org-memory tool: ${name}`, is_error: true };
  }

  const category = input.category as string | undefined;
  if (!category || !(PROOF_LIBRARY_CATEGORIES as readonly string[]).includes(category)) {
    return {
      content: `category is required and must be one of: ${PROOF_LIBRARY_CATEGORIES.join(", ")}`,
      is_error: true,
    };
  }

  const year = typeof input.year === "number" ? input.year : undefined;
  const status = typeof input.status === "string" ? input.status : undefined;
  const funderName = typeof input.funder_name === "string" ? input.funder_name : undefined;
  const limit = typeof input.limit === "number" ? Math.min(input.limit, 50) : 20;

  const entries = await getMemoryByCategory(serviceClient, orgId, category, {
    year,
    status,
    funderName,
    limit,
  });

  if (entries.length === 0) {
    return {
      content: JSON.stringify({
        category,
        count: 0,
        entries: [],
        message: `No ${category} entries found in the org's proof library. Upload relevant documents via the briefing page to populate this data.`,
      }),
    };
  }

  // Return structured JSON so the archetype can cite specific fields
  const simplified = entries.map((e) => ({
    id: e.id,
    title: e.title,
    content: e.content,
    data: e.data,
    created_at: e.created_at,
  }));

  return {
    content: JSON.stringify({
      category,
      count: entries.length,
      entries: simplified,
    }),
  };
}
