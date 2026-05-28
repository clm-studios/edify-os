/**
 * Handlers for draft_grant_content and revise_grant_content tools.
 *
 * Architecture notes (PRD §F4 + §F8):
 *
 * Substrate wiring: getMemoryByCategory pulls proof library entries.
 * Section-first lookup (PRD §F4 table) determines which categories are
 * PRIMARY (full text), SUPPLEMENTARY (first 200 chars + "..."), or VOICE
 * (always loaded as tone anchors).
 *
 * Forward compat (PRD §F8): system-prompt assembly accepts an optional
 * `skillBody` parameter. It is null in MVP. When the skill-routing pattern
 * ships in a follow-up PRD, the skill body string is threaded in as the
 * fourth system block without changing this handler's signature.
 *
 * Cite-or-reject: every draft is parsed for un-cited numbers and quoted
 * strings. Up to 2 retries with an addendum citing the violation. After
 * retry 3, un-cited claims surface with [?] + "(missing citation)".
 *
 * Model routing: Sonnet for all MVP content types. Haiku routing per
 * content_type is v2 perf work (deferred per PRD phasing).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemoryByCategory } from "@/lib/memory/get-by-category";
import { LOI_SECTION_PROMPT } from "@/lib/prompts/grant-writing/loi";
import { STATEMENT_OF_NEED_SECTION_PROMPT } from "@/lib/prompts/grant-writing/statement-of-need";
import { PROJECT_DESCRIPTION_SECTION_PROMPT } from "@/lib/prompts/grant-writing/project-description";
import { BUDGET_NARRATIVE_SECTION_PROMPT } from "@/lib/prompts/grant-writing/budget-narrative";
import type { MvpContentType, GrantContentType, RevisionTone } from "./grant-writing";
import { MVP_CONTENT_TYPES } from "./grant-writing";
import { MODEL_IDS } from "@/lib/chat/run-archetype-turn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftGrantContentInput {
  grant_id?: string;
  content_type: GrantContentType;
  funder_name?: string;
  amount_requested?: number;
  notes_from_user?: string;
  budget_table?: string;
  signatory_name?: string;
  signatory_title?: string;
}

interface ReviseGrantContentInput {
  draft_id?: string;
  draft_text?: string;
  content_type?: GrantContentType;
  feedback?: string;
  tone_change?: RevisionTone;
}

interface GrantDraftResult {
  content: string;
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// Section-first lookup table (PRD §F4)
// P = primary (full text), S = supplementary (first 200 chars), V = voice anchor
// ---------------------------------------------------------------------------

type SubstrateRole = "P" | "S" | "none";

interface SubstrateMapping {
  prior_grants: SubstrateRole;
  outcomes: SubstrateRole;
  // voice_samples is always V (always loaded for all types)
  grant_writing_overlay: ("tone_rules" | "signatory_default" | "indirect_rate_default")[];
}

const SUBSTRATE_MAP: Record<MvpContentType, SubstrateMapping> = {
  loi: {
    prior_grants: "P",
    outcomes: "S",
    grant_writing_overlay: ["tone_rules"],
  },
  statement_of_need: {
    prior_grants: "P",
    outcomes: "P",
    grant_writing_overlay: ["tone_rules"],
  },
  project_description: {
    prior_grants: "S",
    outcomes: "P",
    grant_writing_overlay: ["tone_rules"],
  },
  budget_narrative: {
    prior_grants: "S",
    outcomes: "none",
    grant_writing_overlay: ["indirect_rate_default", "tone_rules"],
  },
};

// ---------------------------------------------------------------------------
// Section prompt resolver
// ---------------------------------------------------------------------------

function getSectionPrompt(contentType: MvpContentType): string {
  switch (contentType) {
    case "loi":
      return LOI_SECTION_PROMPT;
    case "statement_of_need":
      return STATEMENT_OF_NEED_SECTION_PROMPT;
    case "project_description":
      return PROJECT_DESCRIPTION_SECTION_PROMPT;
    case "budget_narrative":
      return BUDGET_NARRATIVE_SECTION_PROMPT;
  }
}

// ---------------------------------------------------------------------------
// Substrate builder — pulls proof library entries per section-first table
// ---------------------------------------------------------------------------

async function buildSubstrate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>,
  orgId: string,
  contentType: MvpContentType,
  funderHint?: string,
): Promise<string> {
  const mapping = SUBSTRATE_MAP[contentType];
  const parts: string[] = [];

  // --- prior_grants ---
  if (mapping.prior_grants !== "none") {
    const isPrimary = mapping.prior_grants === "P";
    const priorGrants = await getMemoryByCategory(serviceClient, orgId, "prior_grants", {
      limit: 5,
      order: "desc",
    });

    if (priorGrants.length > 0) {
      const priorBlock = priorGrants
        .map((e) => {
          const full = `[${e.id}] ${e.title}\n${e.content}`;
          if (isPrimary) return full;
          // Supplementary: first 200 chars
          const preview = e.content.length > 200 ? `${e.content.slice(0, 200)}...` : e.content;
          return `[${e.id}] ${e.title}\n${preview}`;
        })
        .join("\n\n");

      parts.push(`## Prior grants history (${isPrimary ? "PRIMARY" : "supplementary"} — cite [entry_id] when referencing)\n${priorBlock}`);
    }
  }

  // --- outcomes ---
  if (mapping.outcomes !== "none") {
    const isPrimary = mapping.outcomes === "P";
    // For outcomes, try to filter by relevance to funder hint if provided
    const outcomes = await getMemoryByCategory(serviceClient, orgId, "outcomes", {
      limit: 12,
      order: "desc",
    });

    if (outcomes.length > 0) {
      const outcomeBlock = outcomes
        .map((e) => {
          const full = `[${e.id}] ${e.title}\n${e.content}`;
          if (isPrimary) return full;
          const preview = e.content.length > 200 ? `${e.content.slice(0, 200)}...` : e.content;
          return `[${e.id}] ${e.title}\n${preview}`;
        })
        .join("\n\n");

      parts.push(`## Impact outcomes (${isPrimary ? "PRIMARY" : "supplementary"} — cite [entry_id] for every number)\n${outcomeBlock}`);
    }
  }

  // --- voice_samples (always loaded as V for all section types) ---
  const voiceSamples = await getMemoryByCategory(serviceClient, orgId, "voice_samples", {
    limit: 10,
    order: "desc",
  });

  if (voiceSamples.length > 0) {
    const voiceBlock = voiceSamples
      .map((e) => `[${e.id}] ${e.title}\n${e.content}`)
      .join("\n\n");
    parts.push(`## Voice samples (tone anchors — match this register in your draft; cite [entry_id] for direct phrases)\n${voiceBlock}`);
  }

  // --- grant_writing.* overlays ---
  if (mapping.grant_writing_overlay.includes("tone_rules")) {
    const toneRules = await getMemoryByCategory(serviceClient, orgId, "grant_writing.tone_rules", { limit: 20 });
    if (toneRules.length > 0) {
      const ruleBlock = toneRules.map((e) => `- ${e.content}`).join("\n");
      parts.push(`## Tone rules (hard constraints — follow these exactly)\n${ruleBlock}`);
    }
  }

  if (mapping.grant_writing_overlay.includes("signatory_default")) {
    const signatory = await getMemoryByCategory(serviceClient, orgId, "grant_writing.signatory_default", { limit: 1 });
    if (signatory.length > 0) {
      parts.push(`## Signatory default\n${signatory[0].content}`);
    }
  }

  if (mapping.grant_writing_overlay.includes("indirect_rate_default")) {
    const rate = await getMemoryByCategory(serviceClient, orgId, "grant_writing.indirect_rate_default", { limit: 1 });
    if (rate.length > 0) {
      parts.push(`## Indirect rate default\n${rate[0].content}`);
    }
  }

  void funderHint; // future: use for funder-specific relevance filtering on outcomes

  return parts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Citation validation
// ---------------------------------------------------------------------------

// Detects digits not near a [N] or [entry_id] marker.
// A number within 60 chars of a citation marker is considered cited.
// Also detects quoted phrases (≥20 chars) not near a citation — these are
// likely voice samples or external data that require a source.
function detectUncitedClaims(draft: string): string[] {
  const issues: string[] = [];

  // Find all numeric patterns (2+ digit numbers that look like statistics)
  const numberPattern = /\b\d{2,}(?:[,]\d{3})*(?:\.\d+)?%?\b/g;
  let match: RegExpExecArray | null;

  while ((match = numberPattern.exec(draft)) !== null) {
    const pos = match.index;
    // Check 80 chars before and after for a citation marker [...]
    const window = draft.slice(Math.max(0, pos - 80), pos + 80);
    const hasCitation = /\[\w[\w-]*\]|\[\d+\]/.test(window);
    if (!hasCitation) {
      // Exclude years (4-digit starting 19xx or 20xx) from the check
      const num = match[0].replace(/[,%]/g, "");
      if (num.length === 4 && (num.startsWith("19") || num.startsWith("20"))) continue;
      issues.push(`Number "${match[0]}" at position ${pos} appears uncited`);
    }
  }

  // Find quoted phrases ≥20 chars (straight quotes and curly/typographer variants)
  const quotePattern = /(?:[""]([^""]{20,})[""]|"([^"]{20,})")/g;
  while ((match = quotePattern.exec(draft)) !== null) {
    const pos = match.index;
    const phrase = match[1] ?? match[2] ?? "";
    const window = draft.slice(Math.max(0, pos - 80), pos + 80);
    const hasCitation = /\[\w[\w-]*\]|\[\d+\]/.test(window);
    if (!hasCitation) {
      issues.push(`Quoted phrase "${phrase.slice(0, 40)}${phrase.length > 40 ? "…" : ""}" at position ${pos} appears uncited`);
    }
  }

  return issues;
}

// Annotate uncited claims with [?] marker after the number or quoted phrase.
// Handles both numeric statistics and quoted voice-sample phrases (≥20 chars).
function annotateMissingCitations(draft: string): string {
  // First pass: annotate uncited numbers
  let result = draft.replace(/\b(\d{2,}(?:[,]\d{3})*(?:\.\d+)?%?)\b/g, (match, num, offset) => {
    // Skip years
    const clean = num.replace(/[,%]/g, "");
    if (clean.length === 4 && (clean.startsWith("19") || clean.startsWith("20"))) return match;
    const window = draft.slice(Math.max(0, offset - 80), offset + 80);
    const hasCitation = /\[\w[\w-]*\]|\[\d+\]/.test(window);
    if (!hasCitation) return `${match} [?] _(missing citation)_`;
    return match;
  });

  // Second pass: annotate uncited quoted phrases (≥20 chars, straight + curly quotes)
  result = result.replace(/(?:[""]([^""]{20,})[""]|"([^"]{20,})")/g, (match, _p1, _p2, offset) => {
    const window = result.slice(Math.max(0, offset - 80), offset + 80);
    const hasCitation = /\[\w[\w-]*\]|\[\d+\]/.test(window);
    if (!hasCitation) return `${match} [?] _(missing citation)_`;
    return match;
  });

  return result;
}

// ---------------------------------------------------------------------------
// draft_grant_content handler
// ---------------------------------------------------------------------------

export async function executeDraftGrantContent({
  input,
  orgId,
  serviceClient,
  anthropic,
}: {
  input: Record<string, unknown>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
  anthropic: Anthropic;
}): Promise<GrantDraftResult> {
  const typed = input as unknown as DraftGrantContentInput;
  const contentType = typed.content_type;

  // Type-guard: MVP-4 only; return is_error for v2 types
  if (!(MVP_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return {
      content: `content_type "${contentType}" is not available in MVP — coming in v2. Supported types: ${MVP_CONTENT_TYPES.join(", ")}.`,
      is_error: true,
    };
  }

  const mvpType = contentType as MvpContentType;

  // Build substrate from proof library
  let substrate: string;
  try {
    substrate = await buildSubstrate(serviceClient, orgId, mvpType, typed.funder_name);
  } catch (err) {
    console.error("[grant-writing] Substrate build error:", err);
    substrate = "(Proof library unavailable — draft without specific citations.)";
  }

  const sectionPrompt = getSectionPrompt(mvpType);

  // Assemble context addendum from user inputs
  const contextLines: string[] = [];
  if (typed.funder_name) contextLines.push(`Funder: ${typed.funder_name}`);
  if (typed.amount_requested) contextLines.push(`Amount requested: $${typed.amount_requested.toLocaleString()}`);
  if (typed.notes_from_user) contextLines.push(`User notes: ${typed.notes_from_user}`);
  if (typed.budget_table && mvpType === "budget_narrative") {
    contextLines.push(`Budget table:\n${typed.budget_table}`);
  }
  if (typed.grant_id) contextLines.push(`Grant pipeline ID: ${typed.grant_id}`);

  const contextBlock = contextLines.length > 0
    ? `## Request context\n${contextLines.join("\n")}\n\n`
    : "";

  // --- Forward-compat skillBody slot (PRD §F8) ---
  // skillBody is null in MVP. When skill-routing pattern ships, this becomes
  // the grant-narrative.md skill body loaded from the skills directory.
  const skillBody: string | null = null;

  // Build system blocks with prompt caching on archetype + substrate
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: sectionPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache_control: { type: "ephemeral" } as any,
    },
    {
      type: "text",
      text: substrate.length > 0 ? substrate : "(No proof library entries found for this org.)",
    },
    {
      type: "text",
      text: `${contextBlock}Draft the ${mvpType.replace(/_/g, " ")} now. Every specific number, prior outcome, or voice phrasing MUST cite [entry_id] where entry_id is the id shown in brackets in the proof library above. Do not invent numbers or quotes.`,
    },
    // Forward-compat slot: skillBody injected here when skill-routing pattern ships.
    ...(skillBody ? [{ type: "text" as const, text: skillBody }] : []),
  ];

  // Call Claude with retry loop for citation validation
  const MAX_RETRIES = 2;
  let draft = "";
  let lastIssues: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: attempt === 0
          ? "Please draft the content as instructed."
          : `Your previous draft had uncited claims. Please revise to add citations [entry_id] for all specific numbers and outcomes:\n\nUncited items:\n${lastIssues.slice(0, 5).join("\n")}\n\nHere is your previous draft:\n${draft}\n\nRevise to add proper citations.`,
      },
    ];

    try {
      const response = await anthropic.messages.create({
        model: MODEL_IDS.sonnet,
        max_tokens: 2048,
        system: systemBlocks as Anthropic.TextBlockParam[],
        messages,
      });

      const textContent = response.content.find((b) => b.type === "text");
      draft = textContent?.type === "text" ? textContent.text : "";
    } catch (err) {
      console.error(`[grant-writing] Claude call error (attempt ${attempt}):`, err);
      return {
        content: `Draft generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        is_error: true,
      };
    }

    // Validate citations
    const issues = detectUncitedClaims(draft);
    if (issues.length === 0) break;

    lastIssues = issues;

    // On final attempt, annotate rather than retry
    if (attempt === MAX_RETRIES) {
      draft = annotateMissingCitations(draft);
      draft += "\n\n---\n_Note: Some claims above are marked [?] (missing citation). Please verify these figures against your records before submitting._";
    }
  }

  return { content: draft };
}

// ---------------------------------------------------------------------------
// revise_grant_content handler
// ---------------------------------------------------------------------------

const TONE_INSTRUCTIONS: Record<RevisionTone, string> = {
  tighten: "Cut 15-25% of the word count. Remove padding, redundant phrases, and any sentence that does not directly advance the argument. Keep all citations.",
  more_specific: "Add concrete specifics: numbers, names, timelines, locations, participant counts. Replace vague language with precise description. Add citations [entry_id] for any new numbers.",
  less_jargon: "Rewrite in plain language accessible to a general reader. Eliminate sector jargon, acronyms (spell them out), and bureaucratic phrasing. Keep the meaning; simplify the words.",
  more_urgent: "Increase the stakes and sense of urgency. Lead with the most compelling evidence of need. Use active voice. Make the reader feel that delay has consequences.",
  add_data: "Identify the 2-3 places in the draft where additional quantitative evidence would be most compelling. Add outcome figures with citations [entry_id] from the proof library. Do not invent numbers.",
  cite_examples: "Add 1-2 participant vignettes or case examples that illustrate the impact described. Keep each vignette to 2-3 sentences. Draw from voice_samples [entry_id] where available.",
};

export async function executeReviseGrantContent({
  input,
  anthropic,
}: {
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
  anthropic: Anthropic;
}): Promise<GrantDraftResult> {
  const typed = input as unknown as ReviseGrantContentInput;

  const draftText = typed.draft_text;
  if (!draftText || typeof draftText !== "string" || draftText.trim().length === 0) {
    return {
      content: "draft_text is required for revision. Pass the current draft content.",
      is_error: true,
    };
  }

  if (!typed.feedback && !typed.tone_change) {
    return {
      content: "At least one of feedback or tone_change is required.",
      is_error: true,
    };
  }

  const revisionInstructions: string[] = [];
  if (typed.tone_change) {
    revisionInstructions.push(`Tone direction: ${TONE_INSTRUCTIONS[typed.tone_change]}`);
  }
  if (typed.feedback) {
    revisionInstructions.push(`Specific feedback: ${typed.feedback}`);
  }

  const contentTypeLabel = typed.content_type
    ? typed.content_type.replace(/_/g, " ")
    : "grant section";

  const systemPrompt = `You are revising a ${contentTypeLabel} draft for a nonprofit grant application. Apply the revision instructions precisely. Preserve all citations [entry_id] from the original unless the feedback specifically asks you to remove them. Do not add uncited statistics.`;

  const userMessage = `Revision instructions:\n${revisionInstructions.join("\n\n")}\n\nOriginal draft:\n${draftText}\n\nRevise the draft now.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textContent = response.content.find((b) => b.type === "text");
    const revised = textContent?.type === "text" ? textContent.text : "";

    if (!revised) {
      return { content: "Revision produced no output.", is_error: true };
    }

    return { content: revised };
  } catch (err) {
    console.error("[grant-writing] Revision Claude call error:", err);
    return {
      content: `Revision failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      is_error: true,
    };
  }
}
