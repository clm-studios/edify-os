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
import { getMemoryByCategory, serializeFunderProfileForPrompt } from "@/lib/memory/get-by-category";
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

// Matches any citation tag in a draft window:
//   [cited: funder_profile]  — funder-sourced facts (PR-C)
//   [cited: <source>, <date>] — full cited form with source + date
//   [entry_id] / [entry-id]  — org proof-library tags (word chars + hyphens)
//   [42]                     — numeric back-references
//
// No flags: used with .test() only — safe to share (no lastIndex state).
const CITATION_RE = /\[cited:[^\]]+\]|\[\w[\w-]*\]|\[\d+\]/;

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
    const hasCitation = CITATION_RE.test(window);
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
    const hasCitation = CITATION_RE.test(window);
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
    const hasCitation = CITATION_RE.test(window);
    if (!hasCitation) return `${match} [?] _(missing citation)_`;
    return match;
  });

  // Second pass: annotate uncited quoted phrases (≥20 chars, straight + curly quotes)
  result = result.replace(/(?:[""]([^""]{20,})[""]|"([^"]{20,})")/g, (match, _p1, _p2, offset) => {
    const window = result.slice(Math.max(0, offset - 80), offset + 80);
    const hasCitation = CITATION_RE.test(window);
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

  // --- PR-B: Load funder profile for injection into Block-2 ---
  //
  // When draft_grant_content is called with a funder_name, load the org's
  // funder_profile entry for that funder and serialize it for prompt injection.
  //
  // CACHE NOTE: The funder profile block is per-org/per-request content. It is
  // placed in Block-2 (the uncached portion of systemBlocks) alongside the
  // contextBlock and skillBody slot — NEVER in the cached Block-1 sectionPrompt.
  // Block-1 (cache_control: ephemeral) is the stable section prompt only. The
  // substrate (Block-1.5) is also uncached, and the funder profile joins it there.
  // This mirrors the voiceSkillAddendum / frontendDesignAddendum pattern in
  // run-archetype-turn.ts where per-turn content stays outside the cached prefix.
  //
  // No profile found → drafting proceeds as before + one-line suggestion (spec §consumption).
  let funderProfileBlock: string | null = null;
  let funderProfileSuggestion: string | null = null;

  if (typed.funder_name) {
    try {
      const profileEntries = await getMemoryByCategory(
        serviceClient,
        orgId,
        "funder_profile",
        { funderName: typed.funder_name, limit: 1, order: "desc" }
      );

      if (profileEntries.length > 0) {
        funderProfileBlock = serializeFunderProfileForPrompt(profileEntries[0]);
      } else {
        // No profile: one-line suggestion (not an error — drafting continues as today)
        funderProfileSuggestion =
          `Note: No funder profile found for "${typed.funder_name}". ` +
          `The Dev Director can build one using the research_funder workflow (save_funder_profile tool) ` +
          `to unlock funder-informed framing, calibrated ask size, and counter-signal addressing in future drafts.`;
      }
    } catch (err) {
      // Non-fatal: profile load failure falls back to no-profile path
      console.warn("[grant-writing] Funder profile load error:", err);
    }
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

  // ---------------------------------------------------------------------------
  // System blocks — Block-1 (cached) / Block-2 (uncached) split
  //
  // Block-1 (cache_control: ephemeral): sectionPrompt — stable per section type.
  //   Identical for every draft of this section type, so the cache stays warm.
  //
  // Block-2 (no cache_control): everything per-request:
  //   - substrate (proof library entries — org-specific but excluded from cache
  //     because funderName filtering makes them request-variable)
  //   - funderProfileBlock — per-org/per-funder content: MUST be Block-2.
  //     funder_profile is per-org/per-request; placing it in Block-1 would
  //     make it a moving byte and bust the cross-request cache instability
  //     that PR #30's diagnostic is tracking. Mirrors voiceSkillAddendum in
  //     run-archetype-turn.ts (line ~263): intent-conditional content stays
  //     outside the cached prefix.
  //   - contextBlock + draft instruction
  //   - skillBody slot (PRD §F8 forward-compat, null in MVP)
  // ---------------------------------------------------------------------------
  const systemBlocks: Anthropic.TextBlockParam[] = [
    // Block-1: stable section prompt (CACHED)
    {
      type: "text",
      text: sectionPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache_control: { type: "ephemeral" } as any,
    },
    // Block-2: per-request content (NOT cached)
    {
      type: "text",
      text: substrate.length > 0 ? substrate : "(No proof library entries found for this org.)",
    },
    // Funder profile block — injected into Block-2 (uncached) when available.
    // Placement: AFTER substrate, BEFORE the draft instruction, so the model
    // sees proof-library context first, then funder-specific guidance, then
    // the instruction to draft. This is the same region where voiceSkillAddendum
    // and toolAddendums land in run-archetype-turn.ts (conditionalAddendums, Block-2).
    ...(funderProfileBlock ? [{
      type: "text" as const,
      text: `---\n${funderProfileBlock}\n---\n`,
    }] : []),
    {
      type: "text",
      text: `${contextBlock}Draft the ${mvpType.replace(/_/g, " ")} now. Every specific number, prior outcome, or voice phrasing MUST cite [entry_id] where entry_id is the id shown in brackets in the proof library above. Claims sourced from the funder profile above cite [cited: funder_profile]. Do not invent numbers or quotes.`,
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

  // Append no-profile suggestion when no funder profile was found (spec §consumption).
  // This is a one-line addition to the tool result — not an error, just a suggestion.
  if (funderProfileSuggestion && draft) {
    draft = `${draft}\n\n---\n_${funderProfileSuggestion}_`;
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
      model: MODEL_IDS.sonnet,
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
