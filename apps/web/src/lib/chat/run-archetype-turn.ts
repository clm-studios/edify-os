/**
 * Shared helper: run a single user-turn through an archetype's tool-use loop.
 *
 * Used by both:
 *   - /api/team/[slug]/chat/route.ts  (conversation chat)
 *   - /api/heartbeat/trigger/route.ts (proactive heartbeat execution)
 *
 * The chat route manages conversation persistence, history loading, and
 * message storage around this call. The heartbeat trigger route skips all
 * of that and calls this function directly with an empty history.
 *
 * Returns the final assistant text plus any generated files.
 */

import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARCHETYPE_PROMPTS, buildCustomNameInstruction } from "@/lib/archetype-prompts";
import { ARCHETYPE_SERVER_TOOLS, resolveArchetypeTools, executeTool, buildSystemAddendums } from "@/lib/tools/registry";
import { getValidGoogleAccessToken } from "@/lib/google";
import {
  ARCHETYPE_SKILLS,
  SKILL_MIME,
  SKILLS_ADDENDUM,
  SKILLS_BETA_HEADERS,
  CODE_EXECUTION_TOOL,
  buildContainer,
  shouldAttachSkills,
  detectSkillForMessage,
  FRONTEND_DESIGN_ARCHETYPES,
  FRONTEND_DESIGN_ADDENDUM,
  shouldAttachFrontendDesign,
  selectVoiceSkillAddendum,
} from "@/lib/skills/registry";
import type { ArchetypeSlug } from "@/lib/archetypes";
import { insertActivityEvent } from "@/lib/hours-saved/insert-event";
import { ARCHETYPE_PLUGIN_SKILLS, selectSkillsForMessage, SKILL_CAP } from "@/lib/plugins/registry";
import { buildMcpServersForOrg } from "@/lib/mcp/registry";
import { classifyIntent, INTENT_CLASSIFIER_ENABLED } from "@/lib/chat/classify-intent";

const TOOL_USE_LOOP_MAX = 8;
const MAX_RESPONSE_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Server-side self-imposed deadline — Part A of the docx-abort fix.
//
// Vercel Hobby hard-kills functions at 60s maxDuration, bypassing try/catch/finally
// so the assistant DB row stays stuck at 'streaming' forever. By setting our own
// deadline 5s UNDER the Vercel ceiling we can abort in-flight Anthropic SDK calls
// via AbortSignal, emit a terminal SSE event, and persist a terminal DB status —
// all before Vercel's kill fires.
//
// The confirmed docx-stall pattern (Minervamon 2026-06-03 field-op):
//   round 0 = 6s (tool planning) → round 1 = docx-build in Anthropic container
//   = killed at 60s. With TURN_DEADLINE_MS=55000 the abort fires ~5s before the
//   ceiling, giving our code time to flush and persist.
//
// Non-docx turns complete in ~6-40s and are unaffected.
// ---------------------------------------------------------------------------
const TURN_DEADLINE_MS = 55_000;

// ---------------------------------------------------------------------------
// Inline fallback note — appended to whatever the model produced in prior
// rounds when the docx-build round is aborted (Part B strategy: option i).
// Surface the inline draft already generated rather than a blank error.
// ---------------------------------------------------------------------------
const DOCX_TIMEOUT_NOTE =
  "\n\n---\n_The downloadable document build exceeded the time limit on this request. The draft above was generated inline. You can retry to attempt the full document build._";

// B. Model ID map — "sonnet" is the interactive default; "haiku" for cheap workloads.
// Exported so classify-intent.ts can reference the same strings without duplication.
export const MODEL_IDS: Record<"sonnet" | "haiku", string> = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface GeneratedFile {
  name: string;
  mimeType: string;
  downloadUrl: string;
}

export interface RunArchetypeTurnOptions {
  /** Service-role Supabase client (already created by the caller). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
  /** Org UUID — used for tool execution and token lookups. */
  orgId: string;
  /** Member UUID — may be null for system-triggered heartbeats. */
  memberId: string | null;
  /** Archetype slug to run. */
  archetype: ArchetypeSlug;
  /** The user-turn message (proactive prompt or actual user message). */
  userMessage: string;
  /** Initialized Anthropic client for this org. */
  client: Anthropic;
  /** Org name to interpolate into the system prompt. */
  orgName: string;
  /** Optional org mission statement. */
  mission?: string | null;
  /**
   * IANA timezone for the org (e.g. "America/New_York").
   * Used to format the local-time label in the temporal context block.
   * Defaults to "America/New_York" for backward compatibility.
   */
  timezone?: string;
  /** Prior conversation history (empty for heartbeats). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Custom name the member has assigned to this archetype. */
  customArchetypeName?: string | null;
  /**
   * B. Haiku routing — which model to use for this turn.
   * "sonnet" → claude-sonnet-4-6 (default, interactive chat)
   * "haiku"  → claude-haiku-4-5-20251001 (heartbeats, simple Q&A, 5× cheaper)
   */
  model?: "sonnet" | "haiku";
  /**
   * Streaming callback — called for each text delta as Claude generates it.
   * Used by the chat route to push SSE chunks to the browser in real-time.
   * Heartbeat callers can omit this to use the non-streaming accumulation path.
   */
  onTextDelta?: (text: string) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from the Anthropic prompt cache (reduces billing). */
  cacheReadTokens: number;
  /** Tokens written to the Anthropic prompt cache. */
  cacheCreationTokens: number;
}

export interface RunArchetypeTurnResult {
  text: string;
  generatedFiles: GeneratedFile[];
  /** Aggregate token usage across all loop iterations for this turn. */
  tokenUsage: TokenUsage;
}

/**
 * Execute one user-turn through the archetype's tool-use loop.
 * Returns { text, generatedFiles } when the loop reaches end_turn.
 * Throws on unrecoverable API errors — callers should catch.
 */
export async function runArchetypeTurn({
  serviceClient,
  orgId,
  memberId,
  archetype,
  userMessage,
  client: anthropic,
  orgName,
  mission,
  timezone = "America/New_York",
  history = [],
  customArchetypeName,
  model = "sonnet",
  onTextDelta,
}: RunArchetypeTurnOptions): Promise<RunArchetypeTurnResult> {
  // Batch 2 Phase 1 — Intent classifier + Haiku routing.
  //
  // Classifier runs in parallel with tool/MCP resolution (both independent of each other).
  // Light turns route to Haiku (~200-400ms first-token); deliverable turns stay on Sonnet.
  // CACHE NOTE: Anthropic caches per-model — Haiku turns start cold even if Sonnet was warm.
  // The per-turn saving still outweighs this cache miss on light turns.
  const basePrompt = ARCHETYPE_PROMPTS[archetype] ?? "";
  const systemPrompt =
    buildCustomNameInstruction(customArchetypeName) +
    basePrompt.replace(/\{org_name\}/g, orgName);

  const orgContext = mission
    ? `\n\n## Organization Context\nOrg name: ${orgName}\nMission: ${mission}`
    : `\n\n## Organization Context\nOrg name: ${orgName}`;

  // A. Prompt caching — temporal block is volatile (changes every call), so it
  // lives in the user message prefix rather than the cached system prompt.
  // The stable portion (archetype prompt + org context + tool addendums) is
  // marked cache_control: ephemeral so Anthropic caches it across requests.
  const nowUtc = new Date();
  const nowLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(nowUtc);
  // Temporal prefix injected at the top of the user's message (not cached).
  const temporalPrefix = `[Context: Today is ${nowLocal} (${nowUtc.toISOString()} UTC — ${timezone}). When the user refers to "today", "tomorrow", "this week", "next month", etc., interpret relative to this date. Always use ISO 8601 format with the user's timezone offset for calendar operations.]\n\n`;

  // Resolve tools, MCP servers, and (for interactive turns) intent classification in parallel.
  // All three are independent — classifier needs only the message + anthropic client, tool
  // resolution needs only archetype + org DB lookups. Running them together eliminates the
  // classifier from the critical path on turns where tools resolution takes similar time.
  const classifierStartMs = Date.now();
  const [tools, mcpServers, intentResult] = await Promise.all([
    resolveArchetypeTools({ archetype, orgId, serviceClient }),
    buildMcpServersForOrg(archetype, orgId),
    model === "sonnet" && INTENT_CLASSIFIER_ENABLED
      ? classifyIntent(userMessage, history, anthropic)
      : Promise.resolve(null),
  ]);

  let resolvedModel: "sonnet" | "haiku" = model;
  if (intentResult) {
    const classifierMs = Date.now() - classifierStartMs;
    resolvedModel = intentResult.tier === "light" ? "haiku" : "sonnet";
    // [perf] intent log — filter in Vercel with: [perf] intent
    console.log("[perf] intent", {
      orgId,
      archetype,
      userMessageLen: userMessage.length,
      tier: intentResult.tier,
      reason: intentResult.reason,
      classifierMs,
      resolvedModel,
    });
  }

  const modelId = MODEL_IDS[resolvedModel];
  const serverTools = ARCHETYPE_SERVER_TOOLS[archetype] ?? [];
  const archetypeSkillIds = ARCHETYPE_SKILLS[archetype] ?? [];
  const toolAddendums = buildSystemAddendums(tools);

  // E. Plugin skills — uploaded knowledge-work-plugins skill IDs (dynamic, from uploaded-ids.json).
  // These are resolved once before the loop and merged into the container alongside pre-built skills.
  const pluginSkillIds = ARCHETYPE_PLUGIN_SKILLS[archetype] ?? [];

  // C. Skills-on-demand — attach skills when:
  //   (a) the archetype has pre-built skill IDs AND the message signals doc generation, OR
  //   (b) the archetype has uploaded plugin skill IDs (always attach — plugin skills are
  //       always-on domain knowledge, not on-demand doc generators).
  const attachPrebuiltSkills = archetypeSkillIds.length > 0 && shouldAttachSkills(userMessage);
  const attachPluginSkills = pluginSkillIds.length > 0;
  const attachSkills = attachPrebuiltSkills || attachPluginSkills;
  const skillsAddendum = attachPrebuiltSkills ? SKILLS_ADDENDUM : "";

  // D. Frontend Design — inject when archetype is eligible AND design intent is detected.
  // Independent of the docx/xlsx/pptx/pdf skills beta: this is a pure system-prompt
  // augmentation (no code execution, no container, no beta headers).
  const attachFrontendDesign =
    FRONTEND_DESIGN_ARCHETYPES.has(archetype) && shouldAttachFrontendDesign(userMessage);
  const frontendDesignAddendum = attachFrontendDesign ? FRONTEND_DESIGN_ADDENDUM : "";

  // E. Voice Skills — inject the first matching voice-skill addendum when archetype is
  // eligible AND the user message matches the skill's intent triggers.
  // Like frontendDesignAddendum, this is intent-gated and MUST stay in Block 2 (uncached)
  // so it never busts the prompt cache for non-matching turns.
  const voiceSkillAddendum = selectVoiceSkillAddendum(archetype, userMessage);

  // Fix #2 — Split stable vs conditional system prompt.
  //
  // Block 1 (CACHED): archetype-stable content — systemPrompt + orgContext + toolAddendums.
  // This block is identical for every turn of the same org+archetype pair regardless of
  // whether the user is chatting or requesting a document, so the cache NEVER busts mid-
  // conversation. Expected impact: ~40-60% TTFT reduction on turns 2+ once cache is warm.
  //
  // Block 2 (NOT cached): intent-conditional addendums — skillsAddendum + frontendDesignAddendum + voiceSkillAddendum.
  // These change based on detected intent so they must stay outside the cached prefix.
  // Sending them as a separate uncached block preserves model behavior while keeping Block 1 stable.
  //
  // Anthropic prefix-match semantics: cached blocks must come BEFORE uncached blocks.
  // Block 1 (cache_control: ephemeral) is first; Block 2 (no cache_control) is second. ✓
  const stableSystemText = systemPrompt + orgContext + toolAddendums;
  const conditionalAddendums = skillsAddendum + frontendDesignAddendum + voiceSkillAddendum;
  const stableBlock = { type: "text" as const, text: stableSystemText, cache_control: { type: "ephemeral" as const } };
  const systemBlocks = conditionalAddendums
    ? [stableBlock, { type: "text" as const, text: conditionalAddendums }]
    : [stableBlock];

  // Fix #3 — Always include CODE_EXECUTION_TOOL unconditionally.
  //
  // Previously CODE_EXECUTION_TOOL was conditionally appended only when attachSkills was true.
  // Since the audit confirmed attachSkills is effectively always true for all 6 archetypes
  // (all have non-empty ARCHETYPE_PLUGIN_SKILLS entries), this was not causing actual cache
  // misses in production — but it created a fragile dependency. By always including it, the
  // tools array tail (and thus the cache_control marker on the last tool) is stable regardless
  // of future refactoring.
  //
  // Behavioral impact: the model can choose not to use the tool. Including it in available
  // tools does not change response behavior for non-document turns (verified: the model only
  // uses code_execution when it needs to generate a file; it ignores the tool otherwise).
  const allTools = ([...tools, ...serverTools, CODE_EXECUTION_TOOL] as Record<string, unknown>[]);

  // A. Cache the last tool definition (breakpoint on the tools prefix).
  // When tools are present we mark the last one; the API caches tools → system together.
  const cachedTools =
    allTools.length > 0
      ? [
          ...allTools.slice(0, -1),
          { ...allTools[allTools.length - 1], cache_control: { type: "ephemeral" as const } },
        ]
      : allTools;

  // Build the container param, merging pre-built + uploaded plugin skill IDs.
  // SDK shape: container.skills[] where each entry is { type, skill_id, version? }
  //   - Pre-built (docx/xlsx/pptx/pdf): type = "anthropic"
  //   - Uploaded knowledge-work-plugins: type = "custom"
  // Anthropic API limit: max 8 skills in container.skills (confirmed via PR #41 diagnostic).
  // Plugin skills (custom uploaded) already include document generators
  // (document/docx, document/xlsx, document/pptx), so pre-built skills are
  // redundant. Only send plugin skills, capped at SKILL_CAP via priority-based
  // dynamic selection: pin Edify-native skills, fill remaining slots by intent.
  const containerParam = attachSkills
    ? (() => {
        // Priority-based dynamic selection: pin Edify-native skills (always sent),
        // dynamically select vendored skills for remaining slots by intent detection
        // on the user message. See plugins/intent-detection.ts for categories.
        const selectedIds = selectSkillsForMessage(archetype, userMessage, SKILL_CAP);
        const pluginSkills = selectedIds.map((id) => ({
          type: "custom" as const,
          skill_id: id,
        }));
        return pluginSkills.length > 0 ? { skills: pluginSkills } : undefined;
      })()
    : undefined;

  // Prepend temporal prefix to the user message (volatile — stays uncached).
  const userMessageWithTemporal = temporalPrefix + userMessage;

  const loopMessages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessageWithTemporal },
  ];

  const generatedFiles: GeneratedFile[] = [];
  let finalAssistantText = "";
  let lastAssistantText = "";
  // Track whether at least one tool was successfully called this turn.
  // If no tools were called, we insert a baseline chat:turn_no_tools event.
  let anyToolCalled = false;
  // Count tool errors across all loop rounds so we can surface a meaningful
  // failure notice if the loop hits TOOL_USE_LOOP_MAX without finishing.
  let toolErrorCount = 0;
  // Set to true if the for-loop completes all rounds without breaking early
  // (i.e., every round was tool_use with no final end_turn text).
  let loopHitCap = true;
  // Accumulate token usage across all loop iterations.
  const tokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  // Fix #1 — TTFT + cache instrumentation.
  // turnStartMs: recorded once before round 0 (the "request sent" timestamp).
  // ttftMs: time from turnStartMs to first text delta from Claude on round 0.
  // Per-round timings let us see which round in a multi-tool turn is the bottleneck.
  // No PII is logged — only token counts, durations, stop reasons, and org/archetype IDs.
  const turnStartMs = Date.now();
  let ttftMs: number | null = null;
  let firstTokenSeen = false;

  // Part A — self-imposed deadline, 5s under Vercel's 60s hard-kill ceiling.
  // Compute once here so all rounds share the same absolute deadline regardless of
  // how many rounds fire or how long they take.
  const turnDeadlineMs = turnStartMs + TURN_DEADLINE_MS;
  // Set to true when any round is aborted by our deadline signal.
  let turnDeadlineAborted = false;

  // [perf] cachehash — emitted once per turn, before the round loop.
  // Logs sha256 hex digests + lengths/counts of each cached component to diagnose
  // which byte is busting the Anthropic prompt-cache prefix match across requests.
  // mcpSha vs mcpNoTokenSha isolates whether the per-request OAuth authorization_token
  // is the unstable byte (lead hypothesis from Minervamon's 2026-06-03 field capture).
  // SECURITY: raw tokens are never logged; sha256 is one-way and token-stripped variant is logged.
  {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const b1Sha = sha(stableSystemText);
    const b1Len = stableSystemText.length;
    const b2Sha = sha(conditionalAddendums);
    const toolsSha = sha(JSON.stringify(cachedTools));
    const toolCount = cachedTools.length;
    const mcpSha = sha(JSON.stringify(mcpServers));
    const mcpNoTokenSha = sha(
      JSON.stringify(mcpServers.map((s) => ({ ...s, authorization_token: undefined })))
    );
    const mcpCount = mcpServers.length;
    console.log("[perf] cachehash", {
      orgId,
      archetype,
      modelId,
      b1Sha,
      b1Len,
      b2Sha,
      toolsSha,
      toolCount,
      mcpSha,
      mcpNoTokenSha,
      mcpCount,
    });
  }

  // ---------------------------------------------------------------------------
  // Retry + Sonnet fallback helper (PR #16 C1 fix)
  //
  // Wraps the per-round Anthropic call with up to 2 retries on transient errors
  // (429, 500, 502, 503, 504, 529) with exponential backoff (250ms, 750ms).
  // If retries are exhausted AND the call was using Haiku, one final attempt is
  // made on Sonnet. resolvedModel is updated so subsequent rounds also use Sonnet.
  //
  // Non-transient errors (4xx other than 429, unclassified) are thrown immediately.
  // ---------------------------------------------------------------------------
  const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
  const RETRY_DELAYS_MS = [250, 750];

  function isTransient(err: unknown): boolean {
    // Abort errors (from our deadline signal) must NOT be retried — they are
    // intentional and should propagate immediately so the loop can handle them.
    if (err instanceof Error && err.name === "AbortError") return false;
    if (err && typeof err === "object") {
      const status = (err as { status?: number }).status;
      if (typeof status === "number") return RETRYABLE_STATUSES.has(status);
    }
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function callWithRetryAndFallback(makeCall: (mid: string) => Promise<any>, currentRound: number): Promise<any> {
    const startingModel = resolvedModel;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await makeCall(MODEL_IDS[resolvedModel]);
      } catch (err) {
        lastErr = err;
        if (!isTransient(err)) throw err; // non-retryable — propagate immediately
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[attempt]));
        }
      }
    }

    // All retries exhausted. If we were on Haiku, attempt one final call on Sonnet.
    if (startingModel === "haiku") {
      const errStatus = (lastErr as { status?: number })?.status;
      console.log("[perf] fallback", {
        orgId,
        archetype,
        round: currentRound,
        fromModel: "haiku",
        toModel: "sonnet",
        reason: errStatus ?? String(lastErr),
      });
      resolvedModel = "sonnet";
      return makeCall(MODEL_IDS.sonnet);
    }

    throw lastErr;
  }

  for (let round = 0; round < TOOL_USE_LOOP_MAX; round++) {
    // A+B+C+E+F: use cached system blocks, haiku/sonnet model, attach skills on demand,
    // merge plugin skill IDs, and pass MCP server configs.
    //
    // We always use the beta path when ANY of the following apply:
    //   - Pre-built skills are attached (doc generation intent)
    //   - Uploaded plugin skills are available for this archetype
    //   - MCP servers are configured for this org + archetype
    // The non-beta path is used only for pure-chat turns with no skills/MCP.
    const useBetaPath = attachSkills || mcpServers.length > 0;

    // Fix #1 — per-round timing: record when this round's API call starts.
    const roundStartMs = Date.now();

    // Part A — per-round deadline enforcement.
    // Compute remaining budget at the moment this round starts (not at turn start),
    // so accumulating tool execution time is correctly counted against the budget.
    const remainingMs = turnDeadlineMs - Date.now();
    if (remainingMs <= 0) {
      // Budget already exhausted before this round started — abort immediately.
      console.warn("[runArchetypeTurn] deadline reached before round start", {
        orgId, archetype, round, totalElapsedMs: Date.now() - turnStartMs,
      });
      turnDeadlineAborted = true;
      loopHitCap = false;
      break;
    }

    // Create a per-round AbortController that fires when our self-imposed deadline
    // expires. The controller is cancelled (via clearTimeout) if the round completes
    // normally so we don't leave dangling timers.
    const roundAbortController = new AbortController();
    const deadlineTimer = setTimeout(() => {
      roundAbortController.abort(new DOMException("Turn deadline exceeded", "AbortError"));
    }, remainingMs);

    // Use streaming API when an onTextDelta callback is provided.
    // Text deltas are pushed to the caller in real-time; we still await
    // finalMessage() to get the complete response for tool-use loop logic.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;

    try {
    if (onTextDelta) {
      // Streaming path — use .stream() for real-time text deltas.
      // NOTE: if a Haiku stream emits text deltas before failing, the user sees partial
      // output; the Sonnet fallback then produces a second complete response appended to it.
      // This rare edge case is acceptable — the turn completes rather than erroring out.
      response = await callWithRetryAndFallback(async (mid) => {
        if (useBetaPath) {
          const stream = anthropic.beta.messages.stream({
            betas: [...SKILLS_BETA_HEADERS],
            model: mid,
            max_tokens: MAX_RESPONSE_TOKENS,
            temperature: 0.5,
            system: systemBlocks,
            messages: loopMessages,
            ...(cachedTools.length > 0
              ? { tools: cachedTools as unknown as Parameters<typeof anthropic.beta.messages.create>[0]["tools"] }
              : {}),
            ...(containerParam ? { container: containerParam } : {}),
            ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
          }, { signal: roundAbortController.signal });
          stream.on("text", (textDelta) => {
            // Fix #1 — capture TTFT on the very first text delta (round 0 only).
            if (!firstTokenSeen) {
              firstTokenSeen = true;
              ttftMs = Date.now() - turnStartMs;
            }
            onTextDelta(textDelta);
          });
          return stream.finalMessage();
        } else {
          const stream = anthropic.messages.stream({
            model: mid,
            max_tokens: MAX_RESPONSE_TOKENS,
            temperature: 0.5,
            system: systemBlocks,
            messages: loopMessages,
            ...(cachedTools.length > 0 ? { tools: cachedTools as unknown as Parameters<typeof anthropic.messages.create>[0]["tools"] } : {}),
          }, { signal: roundAbortController.signal });
          stream.on("text", (textDelta) => {
            // Fix #1 — capture TTFT on the very first text delta (round 0 only).
            if (!firstTokenSeen) {
              firstTokenSeen = true;
              ttftMs = Date.now() - turnStartMs;
            }
            onTextDelta(textDelta);
          });
          return stream.finalMessage();
        }
      }, round);
    } else {
      // Non-streaming path — used by heartbeats and callers that don't need real-time deltas
      response = await callWithRetryAndFallback((mid) =>
        useBetaPath
          ? anthropic.beta.messages.create({
              betas: [...SKILLS_BETA_HEADERS],
              model: mid,
              max_tokens: MAX_RESPONSE_TOKENS,
              temperature: 0.5,
              system: systemBlocks,
              messages: loopMessages,
              ...(cachedTools.length > 0
                ? { tools: cachedTools as unknown as Parameters<typeof anthropic.beta.messages.create>[0]["tools"] }
                : {}),
              ...(containerParam ? { container: containerParam } : {}),
              ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
            }, { signal: roundAbortController.signal })
          : anthropic.messages.create({
              model: mid,
              max_tokens: MAX_RESPONSE_TOKENS,
              temperature: 0.5,
              system: systemBlocks,
              messages: loopMessages,
              ...(cachedTools.length > 0 ? { tools: cachedTools as unknown as Parameters<typeof anthropic.messages.create>[0]["tools"] } : {}),
            }, { signal: roundAbortController.signal }),
      round);
    }
    } catch (roundErr) {
      // Part A — catch abort errors from our deadline signal.
      // Any other error is re-thrown to the outer loop error handler.
      clearTimeout(deadlineTimer);
      if (roundErr instanceof Error && roundErr.name === "AbortError") {
        // Our self-imposed deadline fired. Surface the inline draft and break
        // cleanly so the route can emit a terminal SSE event + persist the row.
        console.warn("[runArchetypeTurn] deadline abort on round", {
          orgId, archetype, round, totalElapsedMs: Date.now() - turnStartMs,
        });
        turnDeadlineAborted = true;
        loopHitCap = false;
        break;
      }
      throw roundErr;
    }
    clearTimeout(deadlineTimer);

    // Docx-stall triage: cheap content scan to flag a code-execution round —
    // one that carries code-exec tool-result blocks (which is where docx file
    // outputs arrive). Computed BEFORE the round log so we can tag that log with
    // a greppable `codeExecRound` flag, letting a stalled LOI turn be attributed
    // to the code-exec round (candidate (a)) vs a plain generation round. No PII.
    const CODE_EXEC_RESULT_TYPES = new Set([
      "bash_code_execution_tool_result",
      "code_execution_tool_result",
    ]);
    const codeExecRound = Array.isArray(response.content)
      ? response.content.some((b: { type: string }) => CODE_EXEC_RESULT_TYPES.has(b.type))
      : false;

    // Accumulate token usage from this API response
    // Fix #1 — also log per-round structured metrics for Vercel log filtering.
    if (response.usage) {
      const roundDurationMs = Date.now() - roundStartMs;
      tokenUsage.inputTokens += response.usage.input_tokens ?? 0;
      tokenUsage.outputTokens += response.usage.output_tokens ?? 0;
      // Cache token fields are present on BetaUsage (skills path) but not base Usage.
      // Cast through unknown to avoid TS overlap error.
      const usageAny = response.usage as unknown as Record<string, number>;
      const roundCacheRead = usageAny.cache_read_input_tokens ?? 0;
      const roundCacheCreation = usageAny.cache_creation_input_tokens ?? 0;
      tokenUsage.cacheReadTokens += roundCacheRead;
      tokenUsage.cacheCreationTokens += roundCacheCreation;
      // Fix #1 — per-round structured log. Filter in Vercel with: [perf]
      // No PII: no message content, no user identifiers — only metrics.
      // codeExecRound (docx-stall triage) flags the round that ran the docx skill
      // in the Anthropic container — its durationMs is candidate stall point (a).
      console.log("[perf] round", {
        orgId,
        archetype,
        round,
        durationMs: roundDurationMs,
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        cacheReadTokens: roundCacheRead,
        cacheCreationTokens: roundCacheCreation,
        stopReason: response.stop_reason,
        codeExecRound,
      });
    }

    // Collect any skill-generated file outputs (two block-type variants from the beta API)
    //
    // Docx-stall triage instrumentation (diagnosis only — no behavior change):
    // wrap the file-collection block with wall-time so the time spent collecting
    // files in a round is visible DISTINCTLY from the model-generation time already
    // captured by [perf] round.durationMs. `filesCollected` counts the file_id
    // outputs we hand to collectFileOutput. Mirrors the existing
    // `console.log("[perf] <name>", {...})` convention: fire-and-forget, no PII.
    if (attachSkills) {
      const fileCollectStartMs = Date.now();
      let filesCollected = 0;
      const FILE_RESULT_TYPES: Record<string, string> = {
        bash_code_execution_tool_result: "bash_code_execution_result",
        code_execution_tool_result: "code_execution_result",
      };
      for (const block of response.content) {
        const expectedResultType = FILE_RESULT_TYPES[block.type];
        if (!expectedResultType) continue;
        const result = (
          block as {
            type: string;
            content: { type: string; content?: Array<{ type: string; file_id?: string }> };
          }
        ).content;
        if (result?.type === expectedResultType && Array.isArray(result.content)) {
          for (const output of result.content) {
            if (output.file_id) {
              filesCollected++;
              await collectFileOutput(
                output.file_id,
                anthropic,
                generatedFiles,
                SKILL_MIME,
                // Pass context for activity tracking (skill:docx|xlsx|pptx|pdf events)
                { serviceClient, orgId, archetype, memberId },
              );
            }
          }
        }
      }
      // Only emit when this round actually produced file outputs — keeps the
      // log channel focused on the docx-build path and avoids per-round noise.
      if (filesCollected > 0) {
        // [perf] file_collect — wall-time for the whole file-collection step in
        // this round. Filter in Vercel with: [perf] file_collect
        console.log("[perf] file_collect", {
          orgId,
          archetype,
          round,
          filesCollected,
          collectMs: Date.now() - fileCollectStartMs,
        });
      }
    }

    // Capture any text produced in this round
    const textInThisResponse = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { type: string; text: string }) => b.text)
      .join("\n\n");
    if (textInThisResponse) lastAssistantText = textInThisResponse;

    if (response.stop_reason === "tool_use") {
      loopMessages.push({
        role: "assistant",
        content: response.content as Anthropic.MessageParam["content"],
      });

      const toolUseBlocks = (response.content as Anthropic.ContentBlock[]).filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // Only server-side skill tool calls — no client result needed
        finalAssistantText = textInThisResponse;
        loopHitCap = false;
        break;
      }

      // Pre-fetch Google tokens once per round
      const needsCalendarToken = toolUseBlocks.some((b) => b.name.startsWith("calendar_"));
      const needsGmailToken = toolUseBlocks.some((b) => b.name.startsWith("gmail_"));
      const needsDriveToken = toolUseBlocks.some((b) => b.name.startsWith("drive_"));
      const preFetchedTokens = new Map<string, string>();
      await Promise.all([
        needsCalendarToken
          ? getValidGoogleAccessToken(serviceClient, orgId, "google_calendar").then((r) => {
              if (!("error" in r)) preFetchedTokens.set("google_calendar", r.accessToken);
            })
          : Promise.resolve(),
        needsGmailToken
          ? getValidGoogleAccessToken(serviceClient, orgId, "gmail").then((r) => {
              if (!("error" in r)) preFetchedTokens.set("gmail", r.accessToken);
            })
          : Promise.resolve(),
        needsDriveToken
          ? getValidGoogleAccessToken(serviceClient, orgId, "google_drive").then((r) => {
              if (!("error" in r)) preFetchedTokens.set("google_drive", r.accessToken);
            })
          : Promise.resolve(),
      ]);

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          try {
            const result = await executeTool({
              name: block.name,
              input: block.input as Record<string, unknown>,
              orgId,
              memberId,
              serviceClient,
              preFetchedTokens,
              anthropic,
              archetypeSlug: archetype,
            });
            // Tools that produce downloadable files (currently just the
            // render tool) surface them via result.generatedFile — thread
            // them into the outer-turn generatedFiles array so the UI's
            // FileChip picks them up alongside skill-generated files.
            if (result.generatedFile) {
              generatedFiles.push(result.generatedFile);
            }
            // Fire-and-forget: track successful tool call for hours-saved counter.
            // Event key format: "tool:<tool_name>" matching estimates.ts.
            if (result.is_error) {
              toolErrorCount++;
            } else {
              anyToolCalled = true;
              void insertActivityEvent(serviceClient, {
                orgId,
                eventKey: `tool:${block.name}`,
                archetypeSlug: archetype,
                userId: memberId,
                metadata: { tool_use_id: block.id },
              });
            }
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result.content,
              ...(result.is_error ? { is_error: true as const } : {}),
            };
          } catch (err) {
            console.error("[runArchetypeTurn] Tool execution threw", { name: block.name, error: err });
            toolErrorCount++;
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: "Tool execution failed unexpectedly.",
              is_error: true as const,
            };
          }
        })
      );

      loopMessages.push({ role: "user", content: toolResults });
      continue;
    }

    if (response.stop_reason === "refusal") {
      finalAssistantText = "I can't help with that request.";
      loopHitCap = false;
      break;
    }

    if (
      response.stop_reason === "end_turn" ||
      response.stop_reason === "max_tokens" ||
      response.stop_reason === "stop_sequence"
    ) {
      finalAssistantText = textInThisResponse;
      loopHitCap = false;
      break;
    }

    // Skills/beta-specific stop reasons
    if (
      response.stop_reason === "pause_turn" ||
      response.stop_reason === "compaction" ||
      response.stop_reason === "model_context_window_exceeded"
    ) {
      console.warn("[runArchetypeTurn] Skills/beta stop_reason", { stop_reason: response.stop_reason });
      finalAssistantText = textInThisResponse;
      loopHitCap = false;
      break;
    }

    console.warn("[runArchetypeTurn] Unexpected stop_reason", { stop_reason: response.stop_reason });
    finalAssistantText = textInThisResponse;
    loopHitCap = false;
    break;
  }

  // Part A+B — deadline abort handling.
  // When our self-imposed 55s deadline fired mid-round, surface whatever the model
  // produced in prior rounds as an inline draft (Part B strategy i), then append
  // a note so the user knows the downloadable build was cut short and can retry.
  // This runs BEFORE the loopHitCap check so the abort path wins.
  if (turnDeadlineAborted) {
    const elapsed = Date.now() - turnStartMs;
    console.warn("[runArchetypeTurn] Turn aborted by deadline", {
      orgId, archetype, elapsedMs: elapsed, hadPartialText: !!lastAssistantText,
    });
    if (lastAssistantText) {
      // Part B (strategy i): show the inline draft already generated + note.
      finalAssistantText = lastAssistantText + DOCX_TIMEOUT_NOTE;
    } else {
      // No prior text at all (abort hit on round 0 — extremely unlikely given
      // the 55s budget and typical 6s round 0 latency). Surface a clear message.
      finalAssistantText =
        "The request timed out before a response could be generated. Please retry — shorter or simpler requests are less likely to hit the time limit.";
    }
  } else if (loopHitCap) {
    // Loop cap hit — every round was tool_use with no final end_turn text.
    // Surface a failure notice rather than silently using an interim assistant sentence.
    console.warn("[runArchetypeTurn] Tool-use loop hit TOOL_USE_LOOP_MAX", {
      toolErrorCount,
      hadPartialText: !!lastAssistantText,
    });

    if (lastAssistantText) {
      // Append failure notice to whatever interim text the model produced.
      const errorNote = toolErrorCount > 0
        ? `\n\n(I wasn't able to complete this — I tried multiple approaches and ran into ${toolErrorCount} error${toolErrorCount === 1 ? "" : "s"}. Could you simplify the request, or let me know if you'd like me to try something different?)`
        : `\n\n(I wasn't able to finish — I reached my tool-use limit. Could you simplify the request or try a different approach?)`;
      finalAssistantText = lastAssistantText + errorNote;
    } else {
      // No partial text at all — produce a standalone failure message.
      finalAssistantText =
        toolErrorCount > 0
          ? `I reached the tool-use limit while trying to complete this (encountered ${toolErrorCount} tool error${toolErrorCount === 1 ? "" : "s"} along the way). Could you simplify the request or try a different approach?`
          : "I reached the tool-use limit without finishing. Could you simplify the request or try a different approach?";
    }
  } else if (!finalAssistantText) {
    // Non-cap exit but somehow still no text (shouldn't normally happen).
    finalAssistantText = lastAssistantText || "I reached the tool-use limit. Try a more specific question.";
  }

  // Fire-and-forget: if the turn used no tools, record a baseline chat turn.
  if (!anyToolCalled) {
    void insertActivityEvent(serviceClient, {
      orgId,
      eventKey: "chat:turn_no_tools",
      archetypeSlug: archetype,
      userId: memberId,
    });
  }

  // Fix #1 — per-turn aggregate log. Filter in Vercel with: [perf]
  // ttftMs is null for non-streaming (heartbeat) callers — that's expected.
  // No PII: no message content, no user identifiers — only metrics.
  const totalMs = Date.now() - turnStartMs;
  console.log("[perf] turn", {
    orgId,
    archetype,
    model: resolvedModel,
    ttftMs,
    totalMs,
    totalCacheReadTokens: tokenUsage.cacheReadTokens,
    totalCacheCreationTokens: tokenUsage.cacheCreationTokens,
    totalInputTokens: tokenUsage.inputTokens,
    totalOutputTokens: tokenUsage.outputTokens,
  });

  return { text: finalAssistantText, generatedFiles, tokenUsage };
}

// ---------------------------------------------------------------------------
// Helper: collect skill-generated file metadata and build proxy download URL
// ---------------------------------------------------------------------------

interface SkillTrackingContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
  orgId: string;
  archetype: ArchetypeSlug;
  memberId: string | null;
}

async function collectFileOutput(
  fileId: string,
  anthropic: Anthropic,
  generatedFiles: GeneratedFile[],
  mimeMap: Record<string, string>,
  trackingCtx?: SkillTrackingContext,
): Promise<void> {
  let filename = fileId;
  let mimeType = "application/octet-stream";
  let ext = "";

  // Docx-stall triage instrumentation (diagnosis only — no behavior change).
  // Stage timing around the only synchronous network call in this helper
  // (retrieveMetadata). The actual file download + storage proxy happens
  // lazily in /api/files/[fileId] when the user clicks, NOT here — so the
  // in-turn stall, if it lives in this helper, must be the metadata fetch.
  // Mirrors the existing `console.log("[perf] <name>", {...})` convention:
  // fire-and-forget, no PII (only durations, ids, mime, ext, flags).
  const collectStartMs = Date.now();
  let metadataMs: number | null = null;
  // "stage" pins which step a stall lands on if this log is the last one emitted
  // before a turn hangs. It advances as we progress through the helper.
  let stage = "metadata_retrieve";
  let downloadable: boolean | undefined;
  let metadataOk = false;

  try {
    const metaStartMs = Date.now();
    const meta = await anthropic.beta.files.retrieveMetadata(fileId, {
      headers: { "anthropic-beta": "files-api-2025-04-14" },
    } as Parameters<typeof anthropic.beta.files.retrieveMetadata>[1]);
    metadataMs = Date.now() - metaStartMs;
    metadataOk = true;
    stage = "post_metadata";

    // If Anthropic flags this file as not downloadable (e.g. a code-execution
    // container intermediate), don't surface it to chat — clicking it would
    // 4xx via /api/files/[fileId]. The model still sees its tool result; we
    // just suppress the user-facing artifact pill.
    // Strict === false: only skip when the API explicitly says false. If
    // downloadable is true or undefined, keep the existing behavior.
    downloadable = (meta as { downloadable?: boolean }).downloadable;
    if (downloadable === false) {
      // [perf] docx — early-return path (suppressed artifact). Filter: [perf] docx
      console.log("[perf] docx", {
        orgId: trackingCtx?.orgId,
        archetype: trackingCtx?.archetype,
        stage: "skipped_not_downloadable",
        fileIdLen: fileId.length,
        metadataMs,
        metadataOk,
        downloadable,
        totalMs: Date.now() - collectStartMs,
      });
      return;
    }

    if (meta.filename) {
      filename = meta.filename;
      ext = filename.split(".").pop()?.toLowerCase() ?? "";
      if (ext && mimeMap[ext]) mimeType = mimeMap[ext];
    }
  } catch {
    // Non-fatal — use fileId as fallback name
    if (metadataMs === null) metadataMs = Date.now() - collectStartMs;
    stage = "metadata_error";
  }

  generatedFiles.push({
    name: filename,
    mimeType,
    downloadUrl: `/api/files/${encodeURIComponent(fileId)}`,
  });
  stage = "collected";

  // [perf] docx — per-collected-file stage timing. Filter in Vercel with: [perf] docx
  // No PII: only the fileId length (not the id text), mime, ext, durations, flags.
  console.log("[perf] docx", {
    orgId: trackingCtx?.orgId,
    archetype: trackingCtx?.archetype,
    stage,
    fileIdLen: fileId.length,
    ext: ext || null,
    mimeType,
    metadataMs,
    metadataOk,
    downloadable,
    totalMs: Date.now() - collectStartMs,
  });

  // Fire-and-forget: track skill document generation for hours-saved counter.
  if (trackingCtx && ext && ["docx", "xlsx", "pptx", "pdf"].includes(ext)) {
    void insertActivityEvent(trackingCtx.serviceClient, {
      orgId: trackingCtx.orgId,
      eventKey: `skill:${ext}`,
      archetypeSlug: trackingCtx.archetype,
      userId: trackingCtx.memberId,
      metadata: { file_id: fileId },
    });
  }
}
