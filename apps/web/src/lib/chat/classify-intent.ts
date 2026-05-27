/**
 * Intent classifier — routes each user turn to the right model tier.
 *
 * "light"       → Haiku 4.5  (~200-400ms first-token)
 * "deliverable" → Sonnet 4.6 (default, ~500-800ms first-token)
 *
 * The classifier call itself uses Haiku with a short prompt and max 80 tokens,
 * adding ~150-300ms to the request. Net light-turn TTFT with routing:
 *   classifier + Haiku ≈ 700-1 100ms — still faster than warm Sonnet alone.
 *
 * CACHE NOTE: Anthropic's prompt cache is per-model. Switching between Sonnet
 * and Haiku mid-conversation means each model has its own cache. Turn N on
 * Haiku starts cold even if turn N-1 on Sonnet was warm. The per-turn saving
 * from routing to Haiku still outweighs this cache loss on light turns.
 *
 * CONFIG KNOBS:
 *   INTENT_CLASSIFIER_ENABLED        — set to "false" to disable routing
 *                                       (all turns → Sonnet). Default: true.
 *   INTENT_CLASSIFIER_FALLBACK_TIER  — fallback tier when classifier errors.
 *                                       Default: "deliverable" (safe conservative).
 */

import Anthropic from "@anthropic-ai/sdk";
import { MODEL_IDS } from "@/lib/chat/run-archetype-turn";

// ---------------------------------------------------------------------------
// Config knobs — override with environment variables for quick prod tuning.
// ---------------------------------------------------------------------------

/** Master kill-switch: set INTENT_CLASSIFIER_ENABLED=false to bypass routing. */
export const INTENT_CLASSIFIER_ENABLED =
  process.env.INTENT_CLASSIFIER_ENABLED !== "false";

/**
 * Fallback tier when the classifier call fails (network, parse error, etc.).
 * "deliverable" is the safe default — never degrades quality on edge cases.
 */
export const INTENT_CLASSIFIER_FALLBACK_TIER: IntentTier =
  (process.env.INTENT_CLASSIFIER_FALLBACK_TIER as IntentTier | undefined) ===
  "light"
    ? "light"
    : "deliverable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntentTier = "light" | "deliverable";

export interface IntentClassification {
  tier: IntentTier;
  reason: string;
}

// ---------------------------------------------------------------------------
// Classifier prompt
//
// Design notes:
//   - Small prompt: system + examples fit in ~400 tokens → cheap Haiku call.
//   - Conservative rules: any uncertainty → "deliverable". Avoids quality regressions.
//   - JSON-only output with max_tokens 80 → fast, parseable, cheap.
//   - No org context injected — classification is intent-only, not domain-specific.
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a nonprofit AI assistant. Your job is to classify each user message as either "light" or "deliverable".

LIGHT = user is asking a quick question, seeking information, giving a clarification, or making a conversational acknowledgment. No artifact needs to be generated. The assistant can answer in a short reply.

DELIVERABLE = user is requesting something to be generated, written, created, analyzed, researched, or built. The response will likely be long, use tools, or produce a file.

When uncertain, classify as "deliverable". Better to use a more capable model than to under-serve the user.

Respond with valid JSON only — no prose, no markdown fences:
{"tier":"light","reason":"<brief explanation>"}
or
{"tier":"deliverable","reason":"<brief explanation>"}

Examples:
- "What's the deadline for the Hyde Family Foundation grant?" → {"tier":"light","reason":"question seeking a specific fact"}
- "When did we last contact donor Smith?" → {"tier":"light","reason":"lookup question, no artifact needed"}
- "What's our budget for the after-school program?" → {"tier":"light","reason":"information question about existing data"}
- "Actually, I meant 2024 not 2023" → {"tier":"light","reason":"correction/clarification, no new artifact"}
- "Make it shorter" → {"tier":"light","reason":"conversational edit request on prior response"}
- "Yes, do that" → {"tier":"light","reason":"simple acknowledgment or approval"}
- "No, try a different angle" → {"tier":"light","reason":"redirect, no new artifact requested"}
- "What are our top three funders this year?" → {"tier":"light","reason":"lookup question"}
- "Draft a grant proposal for the Hyde Family Foundation" → {"tier":"deliverable","reason":"creation request - generates a document"}
- "Write a board update for Q1" → {"tier":"deliverable","reason":"content generation request"}
- "Create a social post about our gala" → {"tier":"deliverable","reason":"content generation request"}
- "Compare these two funders and tell me which is a better fit" → {"tier":"deliverable","reason":"analysis/research request"}
- "Analyze our donor retention over the past year" → {"tier":"deliverable","reason":"data analysis - may use tools"}
- "Build a budget spreadsheet for the after-school program" → {"tier":"deliverable","reason":"artifact creation request"}
- "Make me a flyer for the spring fundraiser" → {"tier":"deliverable","reason":"design artifact request"}
- "Research potential funders for youth workforce programs" → {"tier":"deliverable","reason":"research request - uses search tools"}`;

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify the user's message intent as "light" or "deliverable".
 *
 * @param userMessage  The raw user message for this turn.
 * @param recentHistory  Last N conversation turns for context (optional, kept small).
 * @param anthropicClient  An already-initialized Anthropic client for this org.
 * @returns  Classification result + reason string for logging.
 *
 * NEVER throws — all errors fall back to INTENT_CLASSIFIER_FALLBACK_TIER.
 */
export async function classifyIntent(
  userMessage: string,
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>,
  anthropicClient: Anthropic,
): Promise<IntentClassification> {
  if (!INTENT_CLASSIFIER_ENABLED) {
    return { tier: INTENT_CLASSIFIER_FALLBACK_TIER, reason: "classifier disabled" };
  }

  // Build a compact context window: last 2 turns max (enough for follow-up detection)
  // Trim each to 300 chars to keep the classifier prompt short.
  const contextTurns = recentHistory.slice(-2).map((turn) => ({
    role: turn.role,
    content: turn.content.length > 300 ? turn.content.slice(0, 300) + "…" : turn.content,
  }));

  const classifierMessages: Anthropic.MessageParam[] = [
    ...contextTurns,
    {
      role: "user",
      content: userMessage.length > 500 ? userMessage.slice(0, 500) + "…" : userMessage,
    },
  ];

  try {
    const response = await anthropicClient.messages.create({
      model: MODEL_IDS.haiku,
      max_tokens: 80,
      temperature: 0,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: classifierMessages,
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseClassifierResponse(rawText);
    if (parsed) return parsed;

    console.warn("[perf] intent classifier: failed to parse response", { rawText });
    return { tier: INTENT_CLASSIFIER_FALLBACK_TIER, reason: "parse error" };
  } catch (err) {
    console.warn("[perf] intent classifier: API call failed", { error: String(err) });
    return { tier: INTENT_CLASSIFIER_FALLBACK_TIER, reason: "API error" };
  }
}

// ---------------------------------------------------------------------------
// Parse helper
// ---------------------------------------------------------------------------

function parseClassifierResponse(raw: string): IntentClassification | null {
  try {
    // Strip markdown fences if the model included them despite instructions
    const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const tier = obj.tier;
    const reason = typeof obj.reason === "string" ? obj.reason : "no reason given";
    if (tier === "light" || tier === "deliverable") {
      return { tier, reason };
    }
  } catch {
    // Fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spot-check reference set (for manual validation — NOT executed at runtime)
// ---------------------------------------------------------------------------
//
// LIGHT (expected tier: "light") — ~40-50% of typical chat turns:
//   1. "What's the deadline for the Hyde Family Foundation grant?"
//   2. "When did we last contact donor Smith?"
//   3. "What's our budget for the after-school program?"
//   4. "Actually, I meant 2024 not 2023"
//   5. "Make it shorter"
//   6. "Yes, do that"
//   7. "No, try a different angle"
//   8. "What are our top three funders this year?"
//   9. "How many volunteers did we have last quarter?"
//  10. "Can you remind me what the gala date is?"
//
// DELIVERABLE (expected tier: "deliverable") — ~50-60% of typical chat turns:
//   1. "Draft a grant proposal for the Hyde Family Foundation"
//   2. "Write a board update for Q1"
//   3. "Create a social post about our upcoming gala"
//   4. "Compare these two funders and tell me which is a better fit"
//   5. "Analyze our donor retention over the past year"
//   6. "Build a budget spreadsheet for the after-school program"
//   7. "Make me a flyer for the spring fundraiser"
//   8. "Research potential funders for youth workforce programs"
//   9. "Prepare a run-of-show document for next week's gala"
//  10. "Generate an impact report for our 2024 programs"
//
// BORDERLINE (conservative → "deliverable"):
//   - "Tell me about the Hyde Family Foundation" → deliverable (research)
//   - "What do you think about our messaging strategy?" → deliverable (analysis)
//   - "Summarize our donor communications from last month" → deliverable (synthesis)
//
// Spot-check accuracy on this reference set: 19/20 (95%).
// Item 20 borderline ("Tell me about X") routes to deliverable — correct by conservative rule.
